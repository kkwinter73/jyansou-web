import { useEffect, useRef, useState } from 'react';
import {
  createGame,
  apply,
  legalActions,
  chooseAction,
  startNextHand,
  seatWindOf,
  DEFAULT_RULE,
  type GameState,
  type GameEvent,
  type Action,
  type Seat,
  type Tile,
  type Meld,
  type RankEntry,
  type RuleConfig,
} from '@jyansou/core';
import { tileLabel, tileSuitClass, WIND_LABEL } from './tiles.js';

const CPU_DELAY = 420;
const TURN_MS = 10000; // 人間の手番/鳴き応答の制限時間
const MELD_LABEL: Record<string, string> = { pon: 'ポン', chi: 'チー', minkan: 'カン', ankan: 'カン', kakan: 'カン' };
const SEAT_NAME = ['あなた', 'CPU右', 'CPU対面', 'CPU左'];

/** 演出バナー（鳴き・和了・局開始）。 */
type Banner = { kind: 'call' | 'riichi' | 'win' | 'round'; seat: Seat; text: string };
const bannerMs = (kind: Banner['kind']) => (kind === 'win' ? 1400 : kind === 'round' ? 1300 : 900);

/** 表示値を target へなめらかに補間するカウントアップ。点棒の増減アニメに使う。 */
function useCountUp(target: number, ms = 550): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    from.current = target;
    if (start === target) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - p) * (1 - p);
      setVal(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}
const ABORT_REASON: Record<string, string> = {
  kyuushu: '九種九牌',
  suufon: '四風連打',
  suucha: '四家立直',
  suukaikan: '四槓散了',
};
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function TileView({ tile, onClick, disabled, back, big }: {
  tile?: Tile;
  onClick?: () => void;
  disabled?: boolean;
  back?: boolean;
  big?: boolean;
}) {
  if (back || !tile) return <span className={`tile back${big ? ' big' : ''}`} />;
  const cls = `tile ${tileSuitClass(tile.kind)}${tile.red ? ' red' : ''}${big ? ' big' : ''}${onClick ? ' clickable' : ''}${disabled ? ' disabled' : ''}`;
  return (
    <button className={cls} onClick={onClick} disabled={disabled || !onClick} type="button">
      <span className="face">{tileLabel(tile.kind)}</span>
    </button>
  );
}

function MeldsRow({ melds }: { melds: Meld[] }) {
  if (melds.length === 0) return null;
  return (
    <div className="melds">
      {melds.map((m, i) => (
        <span key={i} className="meld">
          {m.tiles.map((t) => (
            <TileView key={t.id} tile={t} back={m.type === 'ankan'} />
          ))}
        </span>
      ))}
    </div>
  );
}

function callLabel(a: Action): string {
  switch (a.type) {
    case 'ron': return 'ロン';
    case 'pon': return 'ポン';
    case 'chi': return `チー(${a.tiles.map((t) => tileLabel(t.kind)).join('')})`;
    case 'kan': return a.kind === 'ankan' ? '暗槓' : a.kind === 'kakan' ? '加槓' : 'カン';
    case 'pass': return 'スキップ';
    default: return '';
  }
}

function SeatInfo({ game, seat }: { game: GameState; seat: Seat }) {
  const active = game.turn === seat && game.phase !== 'over';
  const score = useCountUp(game.scores[seat]);
  return (
    <div className={`info i${seat}${active ? ' active' : ''}`}>
      <span className="wind">{WIND_LABEL[seatWindOf(game, seat)]}</span>
      <span className="name">{SEAT_NAME[seat]}</span>
      <span className="score">{score}</span>
      {game.dealer === seat && <span className="dealer">親</span>}
      {game.riichi[seat] && <span className="riichi-stick" title="リーチ" />}
    </div>
  );
}

function StartScreen({ rule, onStart }: { rule: RuleConfig; onStart: (r: RuleConfig) => void }) {
  const [gameLength, setGameLength] = useState<RuleConfig['gameLength']>(rule.gameLength);
  const [akaCount, setAkaCount] = useState(rule.akaCount);
  const [agariyame, setAgariyame] = useState(rule.agariyame);

  return (
    <div className="start">
      <div className="start-card">
        <h1>jyansou</h1>
        <p className="start-sub">対CPU 麻雀</p>

        <div className="setting">
          <span className="setting-label">対局</span>
          <div className="seg">
            <button className={gameLength === 'tonpuu' ? 'on' : ''} onClick={() => setGameLength('tonpuu')}>東風戦</button>
            <button className={gameLength === 'hanchan' ? 'on' : ''} onClick={() => setGameLength('hanchan')}>半荘戦</button>
          </div>
        </div>

        <div className="setting">
          <span className="setting-label">赤ドラ</span>
          <div className="seg">
            {[0, 1, 2, 3].map((n) => (
              <button key={n} className={akaCount === n ? 'on' : ''} onClick={() => setAkaCount(n)}>{n}枚</button>
            ))}
          </div>
        </div>

        <div className="setting">
          <span className="setting-label">アガリやめ</span>
          <div className="seg">
            <button className={agariyame ? 'on' : ''} onClick={() => setAgariyame(true)}>あり</button>
            <button className={!agariyame ? 'on' : ''} onClick={() => setAgariyame(false)}>なし</button>
          </div>
        </div>

        <button className="primary start-btn" onClick={() => onStart({ ...rule, gameLength, akaCount, agariyame })}>
          対局開始
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [rule, setRule] = useState<RuleConfig>(DEFAULT_RULE);
  const [game, setGame] = useState<GameState | null>(null);
  const [final, setFinal] = useState<RankEntry[] | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  // apply の events から演出バナー（鳴き/リーチ/和了）を立てる。
  const fireBanner = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'discard' && e.riichi) return setBanner({ kind: 'riichi', seat: e.seat, text: 'リーチ' });
      if (e.type === 'call') return setBanner({ kind: 'call', seat: e.seat, text: MELD_LABEL[e.meld.type] });
      if (e.type === 'result' && (e.result.type === 'tsumo' || e.result.type === 'ron'))
        return setBanner({ kind: 'win', seat: e.result.winner, text: e.result.type === 'tsumo' ? 'ツモ' : 'ロン' });
    }
  };

  const advance = (source: GameState, action: Action) => {
    const { state, events } = apply(source, action);
    fireBanner(events);
    setGame(state);
  };

  const act = (action: Action) => {
    if (!game) return;
    advance(game, action);
    setRiichiMode(false);
  };

  const showRound = (st: GameState) =>
    setBanner({ kind: 'round', seat: st.dealer, text: `${WIND_LABEL[st.wind]}${st.dealer + 1}局` });

  // 自動進行（ツモ・CPU打牌・CPU鳴き応答）。演出中は止める。
  useEffect(() => {
    const s = game;
    if (!s || final || banner) return;
    let action: Action | null = null;
    if (s.phase === 'draw') action = { type: 'draw' };
    else if (s.phase === 'discard' && s.turn !== 0) action = chooseAction(s, s.turn);
    else if (s.phase === 'afterDiscard' || s.phase === 'afterKakan') {
      const cpu = s.pendingCalls.find((p) => p.seat !== 0 && !s.callResponses[p.seat]);
      if (cpu) action = chooseAction(s, cpu.seat);
    }
    if (!action) return;
    const a = action;
    const timer = setTimeout(() => advance(s, a), CPU_DELAY);
    return () => clearTimeout(timer);
  }, [game, final, banner]);

  // バナーの自動消去。
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), bannerMs(banner.kind));
    return () => clearTimeout(t);
  }, [banner]);

  // 人間の手番/鳴き応答の制限時間。切れたら自動処理（ツモ切り／スキップ）。
  useEffect(() => {
    const s = game;
    if (!s || final || banner) return;
    const myDiscard = s.phase === 'discard' && s.turn === 0 && !!s.drawnTile;
    const myCall =
      (s.phase === 'afterDiscard' || s.phase === 'afterKakan') &&
      s.pendingCalls.some((p) => p.seat === 0) &&
      !s.callResponses[0];
    if (!myDiscard && !myCall) return;
    // 和了できる局面（ツモ/ロン）は自動処理しない（勝ち牌を自動で捨て/見逃さない）。
    if (legalActions(s, 0).some((a) => a.type === 'tsumo' || a.type === 'ron')) return;
    const t = setTimeout(() => {
      if (myDiscard && s.drawnTile) advance(s, { type: 'discard', tile: s.drawnTile });
      else if (myCall) advance(s, { type: 'pass', seat: 0 });
      setRiichiMode(false);
    }, TURN_MS);
    return () => clearTimeout(t);
  }, [game, final, banner]);

  const startGame = (r: RuleConfig) => {
    setRule(r);
    setFinal(null);
    const g = createGame(newSeed(), r);
    setGame(g);
    showRound(g);
  };

  if (!game) return <StartScreen rule={rule} onStart={startGame} />;

  const myTurn = game.phase === 'discard' && game.turn === 0;
  const myActions = myTurn ? legalActions(game, 0) : [];
  const canTsumo = myActions.some((a) => a.type === 'tsumo');
  const riichiKinds = new Set(myActions.flatMap((a) => (a.type === 'discard' && a.riichi ? [a.tile.kind] : [])));
  const kanActions = myActions.filter((a) => a.type === 'kan');
  const kuikae = new Set(game.kuikae);
  const myCallPending =
    (game.phase === 'afterDiscard' || game.phase === 'afterKakan') &&
    game.pendingCalls.some((p) => p.seat === 0) &&
    !game.callResponses[0];
  const callActions = myCallPending ? legalActions(game, 0) : [];

  const discardTile = (tile: Tile) => {
    if (!myTurn || kuikae.has(tile.kind)) return;
    if (riichiMode) {
      if (!riichiKinds.has(tile.kind)) return;
      act({ type: 'discard', tile, riichi: true });
    } else {
      act({ type: 'discard', tile });
    }
  };

  const nextHand = () => {
    const r = startNextHand(game);
    if (r.over) setFinal(r.ranking);
    else {
      setGame(r.state);
      showRound(r.state);
    }
  };
  const restart = () => {
    setFinal(null);
    setGame(null); // 設定画面へ戻る（ルール変更可）
  };

  const me = game.hands[0];
  const drawn = game.turn === 0 && game.phase === 'discard' ? game.drawnTile : null;
  const inHand = me.concealed.filter((t) => !drawn || t.id !== drawn.id);
  const wallLeft = game.liveEnd - game.drawIndex;
  const totalDiscards = game.discards.reduce((n, d) => n + d.length, 0);
  const seats: Seat[] = [0, 1, 2, 3];

  return (
    <div className="app">
      <div className="table">
        {/* 中央ハブ */}
        <div className="hub">
          <div className="round">{WIND_LABEL[game.wind]}{game.dealer + 1}局</div>
          <div className="sub">{game.rule.gameLength === 'tonpuu' ? '東風' : '半荘'} ・ {game.honba}本場 ・ 供託{game.riichiSticks}</div>
          <div className="wall">残り {wallLeft}</div>
          <div className="dora">
            <span className="dora-label">ドラ</span>
            {game.doraIndicators.map((t) => <TileView key={t.id} tile={t} />)}
          </div>
        </div>

        {/* 河（各家） */}
        {seats.map((s) => (
          <div key={s} className={`river r${s}`}>
            {game.discards[s].map((t) => <TileView key={t.id} tile={t} />)}
          </div>
        ))}

        {/* 相手の手牌（裏）と副露 */}
        {([1, 2, 3] as Seat[]).map((s) => (
          <div key={s} className={`ohand o${s}`}>
            {game.hands[s].concealed.map((t) => <TileView key={t.id} back />)}
            <MeldsRow melds={game.hands[s].melds} />
          </div>
        ))}

        {/* 席情報 */}
        {seats.map((s) => <SeatInfo key={s} game={game} seat={s} />)}
      </div>

      {/* 手番タイマー（自分の番/鳴き応答のみ。和了できる局面は出さない） */}
      {((myTurn && !canTsumo) || (myCallPending && !callActions.some((a) => a.type === 'ron'))) && !banner && (
        <div className="turn-timer" key={`${game.phase}-${totalDiscards}-${game.turn}`}>
          <div className="turn-bar" style={{ animationDuration: `${TURN_MS}ms` }} />
        </div>
      )}

      {/* 自分の手牌 */}
      <div className="myarea">
        <MeldsRow melds={me.melds} />
        <div className="myhand">
          {inHand.map((t) => (
            <TileView
              key={t.id}
              tile={t}
              big
              onClick={myTurn ? () => discardTile(t) : undefined}
              // リーチ後はツモ切りのみ（手牌＝ツモ牌以外は打てない）
              disabled={myTurn && (game.riichi[0] || (riichiMode && !riichiKinds.has(t.kind)) || kuikae.has(t.kind))}
            />
          ))}
          {drawn && (
            <span className="drawn">
              <TileView
                tile={drawn}
                big
                onClick={myTurn ? () => discardTile(drawn) : undefined}
                disabled={myTurn && riichiMode && !riichiKinds.has(drawn.kind)}
              />
            </span>
          )}
        </div>

        <div className="controls">
          {canTsumo && <button className="primary" onClick={() => act({ type: 'tsumo' })}>ツモ</button>}
          {riichiKinds.size > 0 && (
            <button className={riichiMode ? 'on' : ''} onClick={() => setRiichiMode((v) => !v)}>
              リーチ{riichiMode ? '（牌を選択）' : ''}
            </button>
          )}
          {kanActions.map((a, i) => <button key={i} onClick={() => act(a)}>{callLabel(a)}</button>)}
          {myActions.some((a) => a.type === 'kyuushu') && (
            <button onClick={() => act({ type: 'kyuushu', seat: 0 })}>九種九牌</button>
          )}
          {myCallPending &&
            callActions.map((a, i) => (
              <button key={i} className={a.type === 'ron' ? 'primary' : a.type === 'pass' ? '' : 'on'} onClick={() => act(a)}>
                {callLabel(a)}
              </button>
            ))}
          {!myTurn && !myCallPending && game.phase !== 'over' && <span className="hint">CPU思考中…</span>}
          {myTurn && !riichiMode && <span className="hint">捨てる牌をクリック</span>}
        </div>
      </div>

      {banner?.kind === 'riichi' && <div className="riichi-flash" />}

      {banner?.kind === 'win' &&
        game.result &&
        seats.map((s) =>
          game.result!.scoreDelta[s] !== 0 ? (
            <div key={s} className={`delta-float d${s} ${game.result!.scoreDelta[s] > 0 ? 'plus' : 'minus'}`}>
              {game.result!.scoreDelta[s] > 0 ? '+' : ''}{game.result!.scoreDelta[s]}
            </div>
          ) : null,
        )}

      {banner && (
        <div className={`banner b-${banner.kind} bs-${banner.seat}`} key={`${banner.kind}-${banner.seat}-${banner.text}`}>
          <div className="banner-inner" style={{ animationDuration: `${bannerMs(banner.kind)}ms` }}>
            {banner.kind !== 'round' && <span className="banner-seat">{SEAT_NAME[banner.seat]}</span>}
            <span className="banner-text">{banner.text}</span>
          </div>
        </div>
      )}

      {game.phase === 'over' && !final && !banner && <ResultOverlay game={game} onNext={nextHand} />}
      {final && <FinalOverlay ranking={final} onRestart={restart} />}
    </div>
  );
}

function ResultOverlay({ game, onNext }: { game: GameState; onNext: () => void }) {
  const r = game.result!;
  return (
    <div className="overlay">
      <div className="card">
        {r.type === 'abortive' ? (
          <>
            <h2>途中流局</h2>
            <p>{ABORT_REASON[r.reason]}</p>
          </>
        ) : r.type === 'ryuukyoku' ? (
          <>
            <h2>流局</h2>
            {r.nagashi && r.nagashi.length > 0 ? (
              <p>流し満貫: {r.nagashi.map((s) => SEAT_NAME[s]).join('、')}</p>
            ) : (
              <p>聴牌: {r.tenpai.length ? r.tenpai.map((s) => SEAT_NAME[s]).join('、') : 'なし'}</p>
            )}
          </>
        ) : (
          <>
            <h2>{SEAT_NAME[r.winner]} {r.type === 'tsumo' ? 'ツモ' : 'ロン'}</h2>
            <ul className="yaku">
              {(r.hand.yakumanTotal > 0
                ? r.hand.yakuman.map((y) => ({ name: y.name, sub: '' as string | number }))
                : [
                    ...r.hand.yaku.map((y) => ({ name: y.name, sub: `${y.han}翻` as string | number })),
                    ...(r.hand.dora.dora > 0 ? [{ name: 'ドラ', sub: r.hand.dora.dora }] : []),
                    ...(r.hand.dora.aka > 0 ? [{ name: '赤ドラ', sub: r.hand.dora.aka }] : []),
                    ...(r.hand.dora.ura > 0 ? [{ name: '裏ドラ', sub: r.hand.dora.ura }] : []),
                  ]
              ).map((y, i) => (
                <li key={y.name} style={{ animationDelay: `${i * 0.09}s` }}>
                  {y.name} {y.sub !== '' && <span>{y.sub}</span>}
                </li>
              ))}
            </ul>
            <p className="score-line">
              {r.hand.yakumanTotal > 0
                ? `役満${r.hand.yakumanTotal > 1 ? `×${r.hand.yakumanTotal}` : ''}`
                : `${r.hand.han}翻 ${r.hand.fu}符`}
              <strong>{r.hand.score.total}点</strong>
            </p>
            {(() => {
              const pao = game.pao[r.winner];
              return pao && r.hand.yakuman.some((y) => y.name === pao.yakuman) ? (
                <p className="pao-line">包: {SEAT_NAME[pao.by]} が{pao.yakuman}を責任払い</p>
              ) : null;
            })()}
          </>
        )}
        <div className="delta">
          {r.scoreDelta.map((d, i) => (
            <span key={i} className={d >= 0 ? 'plus' : 'minus'}>
              {SEAT_NAME[i]} {d >= 0 ? '+' : ''}{d}
            </span>
          ))}
        </div>
        <button className="primary" onClick={onNext}>次局へ</button>
      </div>
    </div>
  );
}

function FinalOverlay({ ranking, onRestart }: { ranking: RankEntry[]; onRestart: () => void }) {
  return (
    <div className="overlay">
      <div className="card">
        <h2>最終順位</h2>
        <ol className="ranking">
          {ranking.map((e) => (
            <li key={e.seat}><span className="rank">{e.rank}位</span> {SEAT_NAME[e.seat]} <span>{e.score}</span></li>
          ))}
        </ol>
        <button className="primary" onClick={onRestart}>もう一度</button>
      </div>
    </div>
  );
}
