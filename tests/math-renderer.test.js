'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const markdown=require('../extension/markdown-renderer.js');
const math=require('../extension/math-renderer.js');
function fixture(){const window=new JSDOM('<!doctype html><div id="answer"></div>').window;const target=window.document.getElementById('answer');return{window,target,render:text=>markdown.render(target,text)};}
const tex=String.raw`2^{O(n/\sqrt{\log n})}`;
for(const [name,source,block] of [
 ['TeX inline',String.raw`复杂度为 \(${tex}\)，仍是次指数。`,false],
 ['dollar inline',`复杂度为 $${tex}$，仍是次指数。`,false],
 ['TeX display',String.raw`\[${tex}\]`,true],
 ['dollar display',`$$\n${tex}\n$$`,true],
 ['the reported ordinary parentheses',`约(${tex})，不解决 P vs NP。`,false]
])test(name+' renders the reported nested exponent and square root',()=>{
 const p=fixture();p.render(source);assert.equal(p.target.querySelectorAll('math').length,1);assert.equal(p.target.querySelector('math').namespaceURI,'http://www.w3.org/1998/Math/MathML');
 assert.ok(p.target.querySelector('msup'));assert.ok(p.target.querySelector('msqrt'));assert.equal(!!p.target.querySelector('.md-math-block'),block);
 assert.doesNotMatch(p.target.textContent,/\\sqrt|\\log|\^\{/);
});
for(const tex of [String.raw`\frac{a_1+b^2}{\sqrt{x}}`,String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}`,String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix}`,String.raw`\alpha + \beta \leq \theta`,String.raw`\left|x\right| + \log n`])test('common TeX structure: '+tex,()=>{
 const p=fixture();p.render(`$$\n${tex}\n$$`);assert.ok(p.target.querySelector('math'));assert.equal(p.target.querySelector('annotation'),null);
});
test('the user paragraph retains Markdown headings and clickable superscript evidence',()=>{
 const p=fixture();p.render('### 正式声明与当前状态\n\n算法仍为次指数（约('+tex+')），不解决 P vs NP。[[1]](https://example.com/paper)\n\n- **要点**：继续核查。&#x20;');
 assert.equal(p.target.querySelector('h3').textContent,'正式声明与当前状态');assert.ok(p.target.querySelector('math'));assert.ok(p.target.querySelector('sup.md-citation a'));assert.equal(p.target.querySelector('strong').textContent,'要点');assert.doesNotMatch(p.target.textContent,/&#x20;/);
});
test('formulas work in emphasis, list items and table cells',()=>{
 const p=fixture();p.render('**值为 $x^2$。**\n\n- $a_1$\n\n| 项目 | 公式 |\n| --- | --- |\n| A | $\\frac{1}{2}$ |');assert.equal(p.target.querySelectorAll('math').length,3);assert.ok(p.target.querySelector('td math'));
});
test('code, escaped dollars, ordinary parentheses and prices keep their literal meaning',()=>{
 const p=fixture();const source=String.raw`价格 $5 和 $10，另付 \$20；普通括号 (hello) 和 (a+b)。代码：`;
 p.render(source+'`$x^2$`\n\n```tex\n'+String.raw`\(\sqrt{x}\)`+'\n```');assert.equal(p.target.querySelectorAll('math').length,0);assert.ok(p.target.textContent.includes('$5 和 $10'));assert.equal(p.target.querySelector('code').textContent,'$x^2$');assert.ok(p.target.querySelector('pre code').textContent.includes('\\sqrt'));
});
test('URLs and named link destinations are not reinterpreted as formulas',()=>{
 const p=fixture();p.render('[来源](https://example.com/$x$/report) 以及 https://example.com/$y$/data');assert.equal(p.target.querySelectorAll('a').length,2);assert.equal(p.target.querySelectorAll('math').length,0);assert.ok(p.target.querySelector('a').href.includes('$x$'));
});
test('every streamed prefix stays readable and the closed formula replaces only itself',()=>{
 const p=fixture(),source=String.raw`\(${tex}\)`;
 for(let i=0;i<source.length;i++){p.render('前文 '+source.slice(0,i));assert.ok(p.target.textContent.startsWith('前文'));assert.equal(p.target.querySelectorAll('math').length,0);}
 p.render('前文 '+source+' 后文');assert.equal(p.target.querySelectorAll('math').length,1);assert.ok(p.target.textContent.endsWith(' 后文'));
});
test('unbalanced ordinary parentheses and invalid TeX preserve their original source',()=>{
 const p=fixture();for(const source of [String.raw`约(2^{O(n/\sqrt{\log n})}`,String.raw`前 $\unknown{x}$ 后`,String.raw`前 \(\frac{1}\) 后`]){p.render(source);assert.equal(p.target.querySelector('math'),null);assert.ok(p.target.textContent.includes(source));}
});
test('a broken formula cannot erase valid neighbors or the rest of the answer',()=>{
 const p=fixture();p.render(String.raw`先 $x^2$，再 $\invalid{x}$，最后 **结束**。`);assert.equal(p.target.querySelectorAll('math').length,1);assert.equal(p.target.querySelector('strong').textContent,'结束');assert.ok(p.target.textContent.includes('\\invalid{x}'));
});
test('unsafe TeX commands and raw HTML create no links, images, styles or executable DOM',()=>{
 const p=fixture();for(const tex of [String.raw`\href{javascript:alert(1)}{click}`,String.raw`\includegraphics{https://example.com/pixel.png}`,String.raw`\htmlClass{evil}{x}`,String.raw`\htmlStyle{background:url(https://example.com)}{x}`,String.raw`\text{<img src=x onerror=alert(1)>}`]){
 p.render('$'+tex+'$');assert.equal(p.target.querySelector('a,img,script,style,iframe,svg'),null);assert.equal(p.target.querySelector('[onclick],[onerror],[href],[src]'),null);
 }
});
test('excessive expressions and recursive macros fall back without losing neighboring prose',()=>{
 const p=fixture();for(const tex of ['x'.repeat(math.LIMITS.expression+1),String.raw`\def\a{\a}\a`]){p.render('前 $'+tex+'$ 后');assert.equal(p.target.querySelector('math'),null);assert.ok(p.target.textContent.startsWith('前'));assert.ok(p.target.textContent.endsWith(' 后'));}
});
test('math rendering uses bounded native DOM creation rather than HTML sinks',()=>{
 const p=fixture();Object.defineProperty(p.window.Element.prototype,'innerHTML',{set(){throw new Error('No HTML sink');},get(){return '';},configurable:true});
 p.render('$'+tex+'$');assert.equal(p.target.querySelectorAll('math').length,1);assert.equal(p.target.querySelector('annotation'),null);assert.equal(p.target.querySelector('.md-math').style.maxWidth,'100%');
});

for(const [open,close] of [['$','$'],['$$','$$'],['\\(','\\)'],['\\[','\\]']])test('streamed prefixes and completion for '+open,()=>{
 const p=fixture(),source=open+tex+close;
 for(let i=0;i<source.length;i++){p.render(source.slice(0,i));assert.equal(p.target.querySelectorAll('math').length,0);}
 p.render(source);assert.equal(p.target.querySelectorAll('math').length,1);
});
test('many formulas are bounded while the rest of the answer remains readable',()=>{
 const p=fixture();p.render(Array(100).fill('$x^2$').join(' ')+' **尾句**');assert.equal(p.target.querySelectorAll('math').length,64);assert.equal(p.target.querySelector('strong').textContent,'尾句');
});

for(const tex of [String.raw`\dfrac{1}{2}`,String.raw`\alpha+\beta`])test('ordinary parentheses share the same supported command list: '+tex,()=>{
 const p=fixture();p.render('前 ('+tex+') 后');assert.equal(p.target.querySelectorAll('math').length,1);assert.ok(p.target.textContent.startsWith('前 '));assert.ok(p.target.textContent.endsWith(' 后'));
});
