import { describe, expect, it } from 'vitest';
import { syncManifestJsonContent } from '../src/path/manifest-sync.js';

const renameLog = [
  { from: 'package', to: 'TOKENpackage' },
  { from: 'static/images', to: 'static/TOKENimages' },
];

describe('syncManifestJsonContent', () => {
  it('updates icon paths under distribute.icons and splashScreens', () => {
    const input = `
    "icons" : {
        "xxhdpi" : "package/icon144.png",
        "foreground" : "package/D-1024.png"
    },
    "splashScreens" : {
        "startWindowIcon" : "package/icon256.png"
    }`;
    const output = syncManifestJsonContent(input, renameLog);
    expect(output).toContain('"xxhdpi" : "TOKENpackage/icon144.png"');
    expect(output).toContain('"foreground" : "TOKENpackage/D-1024.png"');
    expect(output).toContain('"startWindowIcon" : "TOKENpackage/icon256.png"');
  });

  it('syncs static image paths with directory renames', () => {
    const input = '"icon" : "static/images/tabbar/home.png"';
    const output = syncManifestJsonContent(input, renameLog);
    expect(output).toBe('"icon" : "static/TOKENimages/tabbar/home.png"');
  });

  it('does not modify non-image manifest fields', () => {
    const input = `
    "appid" : "__UNI__60BB092",
    "bundleName" : "io.dcloud.uniappx",
    "workers" : "workers",
    "desc" : "你的位置信息将用于小程序位置接口的效果展示"`;
    const output = syncManifestJsonContent(input, renameLog);
    expect(output).toBe(input);
  });

  it('skips remote image URLs', () => {
    const input = '"logo" : "https://example.com/logo.png"';
    const output = syncManifestJsonContent(input, renameLog);
    expect(output).toBe(input);
  });
});
