import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMime, fmtSec, voiceNoticeText } from '../src/core/voice.js';
import { VOICE_COLS } from '../src/store/common.js';

test('sesli not yardımcıları', () => {
  // iPhone gibi: yalnız mp4 → mp4 seçilir; Android eski Chrome gibi: yalnız webm → webm
  assert.equal(pickMime({ isTypeSupported: (m) => m.startsWith('audio/mp4') }), 'audio/mp4;codecs=mp4a.40.2');
  assert.equal(pickMime({ isTypeSupported: (m) => m.startsWith('audio/webm') }), 'audio/webm;codecs=opus');
  assert.equal(pickMime(undefined), '');
  assert.equal(fmtSec(90), '1:30');
  assert.equal(fmtSec(5), '0:05');
  assert.ok(!VOICE_COLS.includes('audio'), 'liste yüklemesi ses verisini taşımamalı');
  assert.match(voiceNoticeText('Ali Can'), /^Sayın veli, Ali Can hakkında/);
});
