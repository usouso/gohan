// src/diners.js — 食べる人（人とファンタジーの生きもの）の定義。数値は「口・あご・手・おなか」の性質。
// hs=頭の大きさ, G=口を開ける最大(px), D=口の奥行き(px), H0=歯と歯の間の休み幅, cheek=ほおばれる余裕, jawPower=一噛みの強さ,
// chewDur=一噛みの秒, throatCap=一度に飲める量(半径7の粒いくつ分), chunkTol=丸飲みと見なす大きさ, stomach=満腹になる量(料理の何倍),
// dex=手の追従の速さ, tremor=手のふるえ(px), grip=箸の握りの確かさ, L1/L2=上腕/前腕(px), likesBite=好きな一口の大きさ(ほおの容量に対する比)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GohanDiners = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DINERS = [
    { id: 'satoshi', name: 'さとし', sub: '会社員・35さい', kind: 'human', hs: 1.0, G: 72, D: 190, H0: 26, cheek: 1.5, jawPower: .45, chewDur: .28, throatCap: 2.6, chunkTol: 7.5, stomach: 1.1, dex: .3, tremor: 0, grip: 1.0, L1: 380, L2: 400, likesBite: .7, slurp: 1.0, manners: 1.0,
      look: { skin: '#f0c8a4', skinDark: '#c48f68', hair: '#2b1f17', hairStyle: 'short', cloth: '#38466a', clothDark: '#222c48', eye: '#2a1a12', lips: '#b86b63', cheekColor: '#e8a98c' },
      face: { nose: 1.0, jaw: 1.0, forehead: 1.0, chin: 1.0, ear: 1.0, eye: 1.0, brow: 1.0, neck: 1.0 },
      lines: { start: ['いただきます。', 'さて、食べるか。'], good: ['うまかった。ごちそうさま。', '今日のは当たりだな。'], ok: ['まあ、ふつうにうまかった。'], bad: ['……なんか、うまく食えなかったな。'], full: ['もう入らない……。'], choke: ['ゴホッ、ゴホッ……'], bone: ['骨が……のどに……！'], timeout: ['昼休みが終わる……！'] } },
    { id: 'yui', name: 'ゆい', sub: '6さい', kind: 'human', hs: .8, G: 50, D: 150, H0: 20, cheek: 1.3, jawPower: .3, chewDur: .22, throatCap: 1.6, chunkTol: 6, stomach: .65, dex: .18, tremor: .6, grip: .7, L1: 290, L2: 300, likesBite: .8, slurp: .7, manners: .6,
      look: { skin: '#f6d6bd', skinDark: '#d8a287', hair: '#3a2418', hairStyle: 'bob', cloth: '#e36b8a', clothDark: '#a8405c', eye: '#2a1a12', lips: '#d27a7a', cheekColor: '#f3a6a0' },
      face: { nose: .6, jaw: .8, forehead: 1.15, chin: .8, ear: .9, eye: 1.35, brow: .7, neck: .8 },
      lines: { start: ['いただきまーす！', 'おなかすいたー！'], good: ['おいしかった！', 'ぜんぶたべた！'], ok: ['おいしかったよ。'], bad: ['ちょっと、たべにくかった……'], full: ['おなかいっぱい……'], choke: ['けほっ、けほっ！'], bone: ['いたい！ほね！'], timeout: ['おそいって、おかあさんが……'] } },
    { id: 'genji', name: '源じい', sub: '82さい', kind: 'human', hs: 1.0, G: 60, D: 185, H0: 24, cheek: 1.4, jawPower: .22, chewDur: .36, throatCap: 1.8, chunkTol: 6.5, stomach: .8, dex: .22, tremor: 2.2, grip: .8, L1: 360, L2: 380, likesBite: .5, slurp: 1.1, manners: 1.0,
      look: { skin: '#e9c5a2', skinDark: '#b98a66', hair: '#d8d4cc', hairStyle: 'bald', cloth: '#6b5b4a', clothDark: '#43382c', eye: '#2a1a12', lips: '#a86a62', cheekColor: '#d9a08a', wrinkles: true, beard: true },
      face: { nose: 1.15, jaw: .95, forehead: 1.0, chin: .9, ear: 1.2, eye: .8, brow: 1.3, neck: .9 },
      lines: { start: ['いただきます。', 'ふむ、よい匂いじゃ。'], good: ['うまかったのう。ごちそうさん。'], ok: ['まあまあ、じゃったな。'], bad: ['歯が、ついていかんのう……'], full: ['年寄りには、多いのう。'], choke: ['ゴッホ、ゴホッ……'], bone: ['ぬう……骨が……'], timeout: ['ゆっくり食うのが、ええんじゃ。'] } },
    { id: 'garm', name: 'ガルム', sub: 'オークの戦士', kind: 'orc', hs: 1.35, G: 120, D: 260, H0: 34, cheek: 1.8, jawPower: .9, chewDur: .3, throatCap: 6, chunkTol: 12, stomach: 1.6, dex: .26, tremor: .8, grip: .6, L1: 470, L2: 480, likesBite: 1.0, slurp: 1.4, manners: .4, special: 'tusks', specialName: '牙で噛みちぎる',
      look: { skin: '#7f9a5a', skinDark: '#4e6433', hair: '#1a1a1a', hairStyle: 'mohawk', cloth: '#5a3a24', clothDark: '#36220f', eye: '#f2d64b', lips: '#4e6433', cheekColor: '#6b8a48', tusks: true },
      face: { nose: 1.2, jaw: 1.4, forehead: .85, chin: 1.3, ear: 1.3, eye: .8, brow: 1.5, neck: 1.5 },
      lines: { start: ['ガハハ、食うぞ！'], good: ['うまい！　もう一皿だ！'], ok: ['悪くねえ。'], bad: ['ちまちました食い物は、苦手だ。'], full: ['まだ食えるぞ？'], choke: ['ガッ、ゴホッ！'], bone: ['骨など、噛みくだく！……ぐっ'], timeout: ['遅い！'] } },
    { id: 'line', name: 'リーネ', sub: 'エルフの司書', kind: 'elf', hs: .95, G: 54, D: 180, H0: 22, cheek: 1.2, jawPower: .4, chewDur: .26, throatCap: 2.0, chunkTol: 6, stomach: .85, dex: .42, tremor: 0, grip: 1.25, L1: 370, L2: 400, likesBite: .4, slurp: .6, manners: 1.6,
      look: { skin: '#f6e3d2', skinDark: '#cfae97', hair: '#e9dcae', hairStyle: 'long', cloth: '#4a6f5e', clothDark: '#2b4538', eye: '#3a6b4a', lips: '#c98a8a', cheekColor: '#efb8b0', pointedEars: true },
      face: { nose: .85, jaw: .85, forehead: 1.0, chin: .9, ear: 1.6, eye: 1.1, brow: .9, neck: .9 },
      lines: { start: ['いただきます。'], good: ['とても、おいしゅうございました。'], ok: ['結構なお味でした。'], bad: ['……静かに、いただきたかったのですが。'], full: ['もう、十分です。'], choke: ['っ……失礼。'], bone: ['……骨が。'], timeout: ['時間を、かけすぎましたね。'] } },
    { id: 'bold', name: 'ボルド', sub: '赤いドラゴン', kind: 'dragon', hs: 1.3, G: 170, D: 300, H0: 44, cheek: 2.5, jawPower: 2.0, chewDur: .42, throatCap: 16, chunkTol: 22, stomach: 3.0, dex: .2, tremor: 1.5, grip: .5, L1: 520, L2: 560, likesBite: 1.2, slurp: 2.0, manners: .3, special: 'fire', specialName: '炎で焼く（I キー / LT）',
      look: { skin: '#a8332a', skinDark: '#5e140f', belly: '#e0b074', hair: '#000000', hairStyle: 'none', cloth: '#a8332a', clothDark: '#5e140f', eye: '#f2c400', lips: '#5e140f', cheekColor: '#8a2a22', horns: true },
      face: { nose: 1.0, jaw: 1.0, forehead: 1.0, chin: 1.0, ear: 1.0, eye: 1.0, brow: 1.0, neck: 1.0 },
      lines: { start: ['我の供物か。食ろうてやる。'], good: ['ほう。悪くない。人の料理は、たまに良い。'], ok: ['腹の足しにはなった。'], bad: ['我を、なめているのか。'], full: ['……まだ、入る。'], choke: ['ぐおっ……ゴホッ'], bone: ['骨など……ぬう'], timeout: ['退屈だ。'] } },
    { id: 'pipi', name: 'ピピ', sub: '妖精', kind: 'fairy', hs: .42, G: 22, D: 80, H0: 12, cheek: 1.2, jawPower: .25, chewDur: .2, throatCap: .5, chunkTol: 3.5, stomach: .25, dex: .45, tremor: .3, grip: 1.0, L1: 150, L2: 160, likesBite: .8, slurp: .4, manners: .8,
      look: { skin: '#fbe7dc', skinDark: '#d9b3a3', hair: '#7fd3c1', hairStyle: 'bob', cloth: '#8ed67a', clothDark: '#58994a', eye: '#2a4a7a', lips: '#e08a9a', cheekColor: '#f6b7c0', wings: true },
      face: { nose: .5, jaw: .8, forehead: 1.2, chin: .8, ear: 1.3, eye: 1.6, brow: .6, neck: .7 },
      lines: { start: ['いただきまーす♪', 'わあ、おおきい！'], good: ['おいしかった～♪'], ok: ['たべたー！'], bad: ['おおきすぎるよ……'], full: ['もうむり～'], choke: ['けほっ！'], bone: ['いたっ！'], timeout: ['つかれたー'] } },
  ];
  for (const d of DINERS) { d.reach = d.L1 + d.L2; }

  // 食べ方の「癖」の名前（結果の画面で使う）
  const STYLE_LABELS = [
    { id: 'ookuchi', text: '大口', when: s => s.swallows >= 2 && s.avgBiteRatio > .85 },
    { id: 'kotori', text: '小鳥食い', when: s => s.swallows >= 3 && s.avgBiteRatio < .3 },
    { id: 'marunomi', text: '丸飲み派', when: s => s.swallows >= 2 && s.chewsPerBite < 2.5 },
    { id: 'yokukamu', text: 'よく噛む人', when: s => s.swallows >= 2 && s.chewsPerBite >= 14 },
    { id: 'hayagui', text: '早食い', when: s => s.eatenFrac >= .5 && s.time < 60 },
    { id: 'yukkuri', text: 'ゆっくり派', when: s => s.swallows >= 3 && s.time > 170 },
    { id: 'koboshi', text: 'こぼし魔', when: s => s.spillFrac > .15 },
    { id: 'kirei', text: 'きれい好き', when: s => s.eatenFrac > .6 && s.spillFrac < .02 },
    { id: 'kucha', text: 'くちゃくちゃ', when: s => s.chews >= 6 && s.openChewFrac > .35 },
    { id: 'musen', text: 'むせんぼう', when: s => s.chokes >= 2 },
    { id: 'honegoto', text: '骨ごと', when: s => s.boneSwallows >= 1 },
    { id: 'honetori', text: '骨とり名人', when: s => s.hadBones && s.boneSwallows === 0 && s.boneBites === 0 && s.eatenFrac > .7 },
    { id: 'zuruzuru', text: 'ズルズル派', when: s => s.slurpTime > 6 },
    { id: 'ochoco', text: 'ぽろぽろ', when: s => s.slips >= 8 },
    { id: 'kachi', text: '箸かじり', when: s => s.clacks >= 4 },
  ];

  return { DINERS, STYLE_LABELS };
});
