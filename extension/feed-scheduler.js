// GENERATED from src/content/feed-scheduler.ts. Edit src/ and run npm run build.
"use strict";
var SuperXFeedScheduler = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/content/feed-scheduler.ts
  var feed_scheduler_exports = {};
  __export(feed_scheduler_exports, {
    selectLookahead: () => selectLookahead
  });
  function selectLookahead(candidates, viewport, options) {
    if (!Number.isFinite(viewport.height) || viewport.height <= 0 || !Number.isFinite(viewport.width) || viewport.width <= 0)
      return [];
    if (!options.all && (!Number.isFinite(options.count) || options.count < 1))
      return [];
    const valid = candidates.filter(
      (candidate) => candidate.id.length > 0 && !candidate.visible && !candidate.isPromoted && [candidate.top, candidate.bottom, candidate.left, candidate.right].every(
        Number.isFinite
      ) && candidate.top >= viewport.height && candidate.bottom > candidate.top && candidate.right > candidate.left && candidate.right > 0 && candidate.left < viewport.width
    );
    valid.sort((a, b) => a.top - b.top);
    const ids = [...new Set(valid.map((candidate) => candidate.id))];
    return options.all ? ids : ids.slice(0, Math.trunc(options.count));
  }
  return __toCommonJS(feed_scheduler_exports);
})();
if (typeof module === "object" && module.exports) module.exports = SuperXFeedScheduler;
