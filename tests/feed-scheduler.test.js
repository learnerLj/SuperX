'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectLookahead}=require('../extension/feed-scheduler.js');
const viewport={width:1000,height:800};
const row=(id,top=800,extra={})=>({id:String(id),top,bottom:top+100,left:0,right:700,visible:false,isPromoted:false,...extra});
test('default five is a fixed spatial window over twenty rows, not a refill target after completion',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i,800+i*100));const expected=['0','1','2','3','4'];
 assert.deepEqual(selectLookahead(rows,viewport,{count:5,all:false}),expected);
 for(const candidate of rows.slice(0,5))candidate.status='completed';assert.deepEqual(selectLookahead(rows,viewport,{count:5,all:false}),expected);
});
test('zero/custom/all modes retain a stable top sort and count duplicate post IDs once',()=>{
 const rows=[row('b',1000),row('a',800),row('tie',800),row('a',900),row('c',1100)];
 assert.deepEqual(selectLookahead(rows,viewport,{count:0,all:false}),[]);assert.deepEqual(selectLookahead(rows,viewport,{count:2,all:false}),['a','tie']);
 assert.deepEqual(selectLookahead(rows,viewport,{count:0,all:true}),['a','tie','b','c']);assert.equal(rows[0].id,'b','Input order is never mutated');
});
test('visible duplicates/promoted/top/viewport/horizontally absent or invalid geometry never becomes a candidate',()=>{
 const rows=[row('visible-duplicate',800,{visible:true}),row('ad',800,{isPromoted:true}),row('top',-100),row('inside',799),row('right',800,{left:1000,right:1100}),row('left',800,{left:-100,right:0}),row('nan',NaN),row('inf',Infinity),row('empty',800,{bottom:800}),row('inverted',800,{right:-1}),row('',800),row('valid',800,{left:-100,right:1})];
 assert.deepEqual(selectLookahead(rows,viewport,{count:100,all:true}),['valid']);
 for(const invalid of [{width:0,height:800},{width:1000,height:0},{width:NaN,height:800},{width:1000,height:Infinity}])assert.deepEqual(selectLookahead(rows,invalid,{count:5,all:true}),[]);
});
test('finite N selects only N and a scroll shifts the fixed window rather than synthesizing new rows',()=>{
 const rows=Array.from({length:20},(_,i)=>row(i,800+i*100));assert.deepEqual(selectLookahead(rows,viewport,{count:3,all:false}),['0','1','2']);
 const scrolled=rows.map(candidate=>({...candidate,top:candidate.top-500,bottom:candidate.bottom-500}));assert.deepEqual(selectLookahead(scrolled,viewport,{count:3,all:false}),['5','6','7']);
 for(const count of [NaN,Infinity,-1])assert.deepEqual(selectLookahead(rows,viewport,{count,all:false}),[]);
});
