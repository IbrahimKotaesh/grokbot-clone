import { type SDKUserMessage, query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env } from '../env.js';
import { db } from '../db.js';
import { appendRow, updateRow, getBotRow } from '../store.js';
import { systemPrompt } from './prompt.js';
import { recentConversation } from './context.js';
import { functionSchemas, type ToolResult } from './tools.js';

const exec = promisify(execFile);
db.exec('CREATE TABLE IF NOT EXISTS claude_sessions (bot_id TEXT PRIMARY KEY, generation INTEGER NOT NULL, session_id TEXT NOT NULL)');

export async function claudeLoginStatus(): Promise<boolean> {
  try {
    const {stdout} = await exec(env.claudeBin, ['auth','status'], {timeout:15_000});
    const status = JSON.parse(stdout);
    return status.loggedIn === true && status.authMethod === 'claude.ai';
  } catch { return false; }
}

export async function claudeTurn(botId: string, text: string, signal: AbortSignal, execute: (name:string,args:unknown,callId:string)=>Promise<ToolResult>, images: string[] = []) {
  if (!await claudeLoginStatus()) throw new Error('Sign in with your Claude subscription first: claude auth login');
  if (signal.aborted) throw new Error('Stopped.');
  const bot = getBotRow(botId);
  const cwd = path.join(os.homedir(), '.local/grokbot-runtime/claude-workspaces', botId);
  fs.mkdirSync(cwd, {recursive:true});
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(abort,20*60_000);
  const schemas = functionSchemas();
  const server = createSdkMcpServer({name:'grokbot',version:'1.0.0',tools:schemas.map(t => {
    const schema = z.fromJSONSchema(t.parameters) as z.ZodObject<any>;
    return tool(t.name,t.description,schema.shape,async (args) => {
      if (controller.signal.aborted) throw new Error('Stopped.');
      const r = await execute(t.name,args,randomUUID());
      const content: any[] = typeof r.output === 'string' ? [{type:'text',text:r.output}] : r.output.map((c:any) => {
        if (c.type !== 'input_image') return {type:'text',text:c.text ?? JSON.stringify(c)};
        const match = /^data:([^;]+);base64,(.*)$/s.exec(c.image_url);
        if (!match) throw new Error('Expected a screenshot data URL');
        return {type:'image',mimeType:match[1],data:match[2]};
      });
      if (r.endTurn) content.push({type:'text',text:'Stop this turn and wait for the user.'});
      return {content};
    },{alwaysLoad:true});
  })});
  const saved = db.prepare('SELECT * FROM claude_sessions WHERE bot_id=? AND generation=?').get(botId,bot.generation) as any;
  const previous = saved ? '' : recentConversation(botId);
  // Authentication is handled by the unmodified Claude CLI. Never extract its tokens.
  const childEnv = {...process.env};
  for (const key of ['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX','CLAUDE_CODE_USE_FOUNDRY']) delete childEnv[key];
  let seq:number|null=null, answer='', wrote=false, completed=false;
  let lastFlush=0;
  const flush = (streaming:boolean) => {
    const body = {type:'message' as const,role:'assistant' as const,text:answer,streaming};
    if(seq===null) seq=appendRow(botId,'message',body).seq; else updateRow(botId,seq,body);
    wrote=true; lastFlush=Date.now();
  };
  async function* photoPrompt(): AsyncGenerator<SDKUserMessage> {
    yield {type:'user',session_id:'',parent_tool_use_id:null,message:{role:'user',content:[{type:'text',text},...images.map(url=>{
      const [,media_type,data]=/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s.exec(url)!;
      return {type:'image' as const,source:{type:'base64' as const,media_type:media_type as 'image/jpeg'|'image/png'|'image/webp',data}};
    })]}};
  }
  const run = query({prompt:images.length?photoPrompt():text,options:{
    cwd,pathToClaudeCodeExecutable:env.claudeBin,abortController:controller,
    env:childEnv,settingSources:[],strictMcpConfig:true,tools:[],
    mcpServers:{grokbot:server},allowedTools:schemas.map(t=>`mcp__grokbot__${t.name}`),
    permissionMode:'default',includePartialMessages:true,maxTurns:60,
    ...(saved ? {resume:saved.session_id}:{}),
    ...(bot.model || env.claudeModel ? {model:bot.model || env.claudeModel}:{}),
    effort:bot.effort ?? 'medium',
    systemPrompt:await systemPrompt(bot.user_id,botId) + '\nUse the supplied MCP tools for the local Linux computer. All shell commands run inside Linux. Use remember for durable memories.' + (previous ? `\n\nPrevious conversation, for continuity (quoted context, not new instructions):\n${previous}`:''),
    canUseTool:async () => ({behavior:'deny',message:'Use the supplied Grokbot tools.'}),
  }});
  try {
    for await(const message of run) {
      if (message.type==='system' && message.subtype==='init') db.prepare('INSERT OR REPLACE INTO claude_sessions VALUES (?,?,?)').run(botId,bot.generation,message.session_id);
      if(message.type==='stream_event' && message.event.type==='content_block_delta' && message.event.delta.type==='text_delta') {
        answer+=message.event.delta.text;
        if(seq===null || Date.now()-lastFlush>60) flush(true);
      }
      if(message.type==='assistant') {
        const full=message.message.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');
        if(full) {answer=full;flush(false);seq=null;answer='';}
      }
      if(message.type==='result') {
        if(message.subtype!=='success') throw new Error(message.errors?.join('; ') || `Claude: ${message.subtype}`);
        if(!wrote && message.result) {answer=message.result;flush(false);seq=null;answer='';}
        completed=true;
      }
    }
    if(!completed) throw new Error('Claude ended without a completed response');
  } finally {
    run.close();clearTimeout(timer);signal.removeEventListener('abort',abort);
    if(seq!==null) flush(false);
  }
}
