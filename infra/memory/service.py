"""Private local Mem0 semantic index. No hosted model calls or fact inference."""
import os
os.environ['MEM0_TELEMETRY'] = 'false'
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import hmac
import threading
from pathlib import Path
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from fastapi import FastAPI, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from mem0 import Memory
from mem0.embeddings.base import EmbeddingBase
from mem0.utils.factory import EmbedderFactory

ROOT = Path(os.environ.get('FINO_MEMORY_DATA', '/var/lib/fino-memory'))
KEY = os.environ['FINO_MEMORY_KEY']
class E5Embedding(EmbeddingBase):
    def __init__(self, config=None):
        super().__init__(config)
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(ROOT/'models/e5/model.onnx'), opts, providers=['CPUExecutionProvider'])
        self.tokenizer = Tokenizer.from_file(str(ROOT/'models/e5/tokenizer.json'))
        self.tokenizer.enable_truncation(max_length=512)
    def embed(self, text, memory_action='add'):
        prefix = 'query: ' if memory_action == 'search' else 'passage: '
        encoded = self.tokenizer.encode(prefix + str(text))
        mask = np.array([encoded.attention_mask], dtype=np.int64)
        feed = {'input_ids': np.array([encoded.ids], dtype=np.int64), 'attention_mask': mask}
        names = {x.name for x in self.session.get_inputs()}
        if 'token_type_ids' in names: feed['token_type_ids'] = np.array([encoded.type_ids], dtype=np.int64)
        out = self.session.run(None, feed)[0]
        pooled = (out * mask[..., None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
        pooled /= np.linalg.norm(pooled, axis=1, keepdims=True).clip(min=1e-12)
        return pooled[0].tolist()

# Public provider registration; use an ONNX encoder instead of loading PyTorch.
EmbedderFactory.provider_to_class['huggingface'] = 'service.E5Embedding'
index = None
index_lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

def auth(authorization: str = Header(default='')):
    if not hmac.compare_digest(authorization, 'Bearer ' + KEY): raise HTTPException(401)

class Fact(BaseModel):
    id: str = Field(max_length=100)
    text: str = Field(max_length=2000)
class Scope(BaseModel):
    scope: str = Field(pattern=r'^[a-zA-Z0-9_:-]{1,160}$')
class IndexRequest(Scope):
    facts: list[Fact] = Field(max_length=500)
class SearchRequest(Scope):
    query: str = Field(max_length=2000)
@app.on_event('startup')
def startup():
    global index
    index = Memory.from_config({
        'llm': {'provider': 'openai', 'config': {'api_key': 'local-only', 'openai_base_url': 'http://127.0.0.1:8843/v1', 'model': 'fino-memory'}},
        'embedder': {'provider': 'huggingface', 'config': {'embedding_dims': 384}},
        'vector_store': {'provider': 'qdrant', 'config': {'collection_name': 'fino_facts', 'path': str(ROOT/'qdrant'), 'embedding_model_dims': 384}},
        'history_db_path': str(ROOT/'history.db'),
    })
    index.embedding_model.embed('ready')

@app.get('/health', dependencies=[Depends(auth)])
def health(): return {'ok': index is not None, 'engine': 'mem0', 'embedding': 'multilingual-e5-small-int8'}

@app.post('/index', dependencies=[Depends(auth)])
def sync(req: IndexRequest):
    # SQLite in the app is canonical. Reconcile updates AND deletions; never resurrect a removed fact.
    with index_lock:
        old = index.get_all(filters={'user_id': req.scope}, top_k=1000)['results']
        wanted = {f.id: f for f in req.facts}
        retained = set()
        for item in old:
            fid = item.get('metadata', {}).get('fino_id')
            fact = wanted.get(fid)
            if fact and item['memory'] == fact.text and fid not in retained: retained.add(fid)
            else: index.delete(item['id'])
        for fid, fact in wanted.items():
            if fid not in retained:
                index.add(fact.text, user_id=req.scope, infer=False, metadata={'fino_id': fid})
    return {'ok': True, 'count': len(wanted)}

@app.post('/search', dependencies=[Depends(auth)])
def search(req: SearchRequest):
    # Do not queue an interactive request behind a slow index rebuild.
    if not index_lock.acquire(blocking=False): raise HTTPException(503, 'Index updating')
    try:
        results = index.search(req.query, filters={'user_id': req.scope}, top_k=5, rerank=False)['results']
        return {'ids': [r.get('metadata', {}).get('fino_id') for r in results]}
    finally: index_lock.release()
