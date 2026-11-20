import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {db} from '../server/dist/db.js';import {createBot} from '../server/dist/bots.js';import {nativeImageReceiver,nativeImageBytes} from '../server/dist/agent/native-images.js';
import {inChat} from '../server/dist/lib/chat-scope.js';import {createChat} from '../server/dist/chats.js';
for(const id of ['owner','other'])db.prepare('INSERT INTO users(id,email,name,created_at) VALUES (?,?,?,?)').run(id,id+'@example.com',id,Date.now());
const bot=createBot('owner',{name:'Artist'}),root=fs.mkdtempSync(path.join(os.tmpdir(),'fino-native-image-'));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR5kAAAAASUVORK5CYII=','base64');
try{
 const filename=path.join(root,'generated.png');fs.writeFileSync(filename,png);
 assert.deepEqual(nativeImageBytes({savedPath:filename},[root]),png);assert.deepEqual(nativeImageBytes({result:png.toString('base64')},[root]),png);
 assert.throws(()=>nativeImageBytes({savedPath:filename},[path.join(root,'nonexistent')]));
 assert.throws(()=>nativeImageBytes({result:'https://example.com/image.png'},[root]));
 const outside=root+'-outside';fs.writeFileSync(outside,png);fs.symlinkSync(outside,path.join(root,'escape.png'));
 try{assert.throws(()=>nativeImageBytes({savedPath:path.join(root,'escape.png')},[root]));}finally{fs.unlinkSync(outside);}
 fs.writeFileSync(path.join(root,'large.png'),Buffer.alloc(3*1024*1024+1));assert.throws(()=>nativeImageBytes({savedPath:path.join(root,'large.png')},[root]));
 assert.throws(()=>nativeImageReceiver('other',bot.id,[root]));
 const receiver=nativeImageReceiver('owner',bot.id,[root]);receiver.receive({id:'image-test',status:'in_progress'},'started');
 receiver.receive({id:'image-test',status:'completed',savedPath:filename},'completed');receiver.receive({id:'image-test',status:'completed',savedPath:filename},'completed');
 assert.equal(receiver.delivered,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM message_images WHERE bot_id=?').get(bot.id).n,1,'Repeated completion must not duplicate the image');
 const row=JSON.parse(db.prepare("SELECT body FROM rows WHERE bot_id=? AND kind='message' ORDER BY seq DESC LIMIT 1").get(bot.id).body);assert.equal(row.images.length,1);assert.ok(row.images[0].url.startsWith('/api/bots/'+bot.id+'/images/'));
 receiver.receive({id:'limit',status:'failed',failure:{type:'usageLimitExceeded'}},'completed');assert.equal(receiver.failed,true);assert.equal(receiver.delivered,1);
 receiver.receive({id:'bad',status:'completed',result:Buffer.from('%PDF-1.4 test-only').toString('base64')},'completed');assert.equal(db.prepare('SELECT COUNT(*) n FROM message_images').get().n,1,'Non-image files cannot be delivered through native image events');
 const subchat=createChat(bot.id),scopedReceiver=inChat(bot.id,subchat.generation,()=>nativeImageReceiver('owner',bot.id,[root]));
 scopedReceiver.receive({id:'late-subchat-image',status:'completed',savedPath:filename},'completed');
 assert.equal(scopedReceiver.delivered,1);assert.equal(db.prepare("SELECT generation FROM rows WHERE bot_id=? AND kind='message' ORDER BY seq DESC LIMIT 1").get(bot.id).generation,subchat.generation,'Late image callbacks retain their originating chat outside its async scope');
 console.log('PASS: native image event delivery, originating subchat, inline attachments, deduplication, quota errors, owner isolation and host-file/URL/oversize rejection');
}finally{fs.rmSync(root,{recursive:true,force:true});db.close();}process.exit(0);
