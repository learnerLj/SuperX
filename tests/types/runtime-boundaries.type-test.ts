/** Compile the real consumers: generated JS is never the type owner. */
import type {Settings,Post} from '../../src/shared/contracts';
import type {API as Native} from '../../src/providers/native-provider';
import type {API as Layout} from '../../src/content/overlay-layout';
import type {API as UI} from '../../src/ui/i18n';
import type {API as Draft} from '../../src/content/draft-composer';
declare const settings:Settings,post:Post,native:Native,layout:Layout,ui:UI,draft:Draft;
declare const panel:HTMLElement;
const target={id:'post',article:panel};
const placements=layout.placeRailRows([{id:target,rect:{top:0,bottom:200,left:0,right:600}}],{width:2000,height:1000});
const sameTarget:typeof target|undefined=placements[0]?.id;
ui.apply(document,'zh-CN');draft.create({document,core:XGrokCore,send:message=>Boolean(message.type)});
// @ts-expect-error A layout rectangle needs all four measured edges.
layout.placeRailRows([{id:target,rect:{top:0,bottom:100}}],{width:1000,height:800});
// @ts-expect-error Native provider clients must provide the real port lifecycle.
native.create({chrome}).run(post,settings,{client:{tabId:1,port:{postMessage(){}}}});
// @ts-expect-error UI translation requires a DOM consumer, not a selector string.
ui.apply('#settings','zh-CN');
// @ts-expect-error Draft dispatch must report whether its message was accepted.
draft.create({document,send:()=>undefined});
void sameTarget;
