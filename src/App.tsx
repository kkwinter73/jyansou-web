import { useCallback, useEffect, useState } from 'react';
import {
  createGame,
  apply,
  legalActions,
  chooseAction,
  startNextHand,
  seatWindOf,
  type GameState,
  type Action,
  type Seat,
  type Tile,
  type Meld,
  type RankEntry,
} from '@jyansou/core';
import { tileLabel, tileSuitClass, WIND_LABEL } from './tiles.js';

const CPU_DELAY = 380;
const SEAT_NAME = ['あなた', 'CPU右', 'CPU対面', 'CPU左'];
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function TileView({ tile, onClick, disabled, back, small }: {
  tile?: Tile;
  onClick?: () => void;
  disabled?: boolean;
  back?: boolean;
  small?: boolean;
}) {
  if (back || !tile) return <span className={`tile back${small ? ' small' : ''}`} />;
  const cls = `tile ${tileSuitClass(tile.kind)}${tile.red ? ' red' : ''}${small ? ' small' : ''}${onClick ? ' clickable' : ''}${disabled ? ' disabled' : ''}`;
  return (
    <button className={cls} onClick={onClick} disabled={disabled || !onClick} type="button">
      {tileLabel(tile.kind)}
    </button>
  );
}

function Melds({ melds }: { melds: Meld[] }) {
  if (melds.length === 0) return null;
  return (
    <div className="melds">
      {melds.map((m, i) => (
        <span key={i} className="meld">
          {m.tiles.map((t) => (
            <TileView key={t.id} tile={t} small back={m.type === 'ankan'} />
          ))}
        </span>
      ))}
    </div>
  );
}

function Discards({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="discards">
      {tiles.map((t) => (
        <TileView key={t.id} tile={t} small />
      ))}
    </div>
  );
}

function OpponentPanel({ game, seat }: { game: GameState; seat: Seat }) {
  const h = game.hands[seat];
  return (
    <div className="panel opp">
      <div className="meta">
        <span className="wind">{WIND_LABEL[seatWindOf(game, seat)]}</span>
        <span className="name">{SEAT_NAME[seat]}</span>
        <span className="score">{game.scores[seat]}</span>
        {game.dealer === seat && <span className="badge">親</span>}
        {game.riichi[seat] && <span className="badge riichi">リーチ</span>}
        {game.turn === seat && game.phase !== 'over' && <span className="badge turn">手番</span>}
      </div>
      <div className="hand-back">
        {h.concealed.map((t) => (
          <TileView key={t.id} back small />
        ))}
      </div>
      <Melds melds={h.melds} />
      <Discards tiles={game.discards[seat]} />
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

export function App() {
  const [game, setGame] = useState<GameState>(() => createGame(newSeed()));
  const [final, setFinal] = useState<RankEntry[] | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);

  // 自動進行: ツモ（全席）、CPUの打牌、CPUの鳴き応答（人間の応答待ちは止める）
  useEffect(() => {
    const s = game;
    if (final) return;
    let run: (() => GameState) | null = null;
    if (s.phase === 'draw') run = () => apply(s, { type: 'draw' }).state;
    else if (s.phase === 'discard' && s.turn !== 0) run = () => apply(s, chooseAction(s, s.turn)).state;
    else if (s.phase === 'afterDiscard' || s.phase === 'afterKakan') {
      const cpu = s.pendingCalls.find((p) => p.seat !== 0 && !s.callResponses[p.seat]);
      if (cpu) run = () => apply(s, chooseAction(s, cpu.seat)).state;
    }
    if (!run) return;
    const timer = setTimeout(() => setGame((g) => (g === s ? run!() : g)), CPU_DELAY);
    return () => clearTimeout(timer);
  }, [game, final]);

  const act = useCallback((action: Action) => {
    setGame((g) => apply(g, action).state);
    setRiichiMode(false);
  }, []);

  const myTurn = game.phase === 'discard' && game.turn === 0;
  const myActions = myTurn ? legalActions(game, 0) : [];
  const canTsumo = myActions.some((a) => a.type === 'tsumo');
  const riichiKinds = new Set(
    myActions.flatMap((a) => (a.type === 'discard' && a.riichi ? [a.tile.kind] : [])),
  );
  const kanActions = myActions.filter((a) => a.type === 'kan'); // 暗槓/加槓
  const kuikae = new Set(game.kuikae);

  // 鳴き応答（afterDiscard / afterKakan で自分が保留中）
  const myCallPending =
    (game.phase === 'afterDiscard' || game.phase === 'afterKakan') &&
    game.pendingCalls.some((p) => p.seat === 0) &&
    !game.callResponses[0];
  const callActions = myCallPending ? legalActions(game, 0) : [];

  const discardTile = (tile: Tile) => {
    if (!myTurn) return;
    if (kuikae.has(tile.kind)) return;
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
    else setGame(r.state);
  };
  const restart = () => {
    setFinal(null);
    setGame(createGame(newSeed()));
  };

  const me = game.hands[0];
  const drawn = game.turn === 0 && game.phase === 'discard' ? game.drawnTile : null;
  const inHand = me.concealed.filter((t) => !drawn || t.id !== drawn.id);
  const wallLeft = game.liveEnd - game.drawIndex;

  return (
    <div className="app">
      <header>
        <h1>jyansou 🀄</h1>
        <div className="round">
          <span>{WIND_LABEL[game.wind]}{game.dealer + 1}局</span>
          <span>{game.honba}本場</span>
          <span>供託 {game.riichiSticks}</span>
          <span>残り {wallLeft}</span>
          <span className="dora">ドラ表示{game.doraIndicators.map((t) => <TileView key={t.id} tile={t} small />)}</span>
        </div>
      </header>

      <section className="table">
        <OpponentPanel game={game} seat={2} />
        <div className="mid">
          <OpponentPanel game={game} seat={3} />
          <OpponentPanel game={game} seat={1} />
        </div>

        <div className="panel me">
          <div className="meta">
            <span className="wind">{WIND_LABEL[seatWindOf(game, 0)]}</span>
            <span className="name">{SEAT_NAME[0]}</span>
            <span className="score">{game.scores[0]}</span>
            {game.dealer === 0 && <span className="badge">親</span>}
            {game.riichi[0] && <span className="badge riichi">リーチ</span>}
            {game.turn === 0 && game.phase !== 'over' && <span className="badge turn">手番</span>}
          </div>
          <Melds melds={me.melds} />
          <Discards tiles={game.discards[0]} />
          <div className="hand">
            {inHand.map((t) => (
              <TileView
                key={t.id}
                tile={t}
                onClick={myTurn ? () => discardTile(t) : undefined}
                disabled={myTurn && ((riichiMode && !riichiKinds.has(t.kind)) || kuikae.has(t.kind))}
              />
            ))}
            {drawn && (
              <span className="drawn">
                <TileView
                  tile={drawn}
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
            {kanActions.map((a, i) => (
              <button key={i} onClick={() => act(a)}>{callLabel(a)}</button>
            ))}
            {myCallPending &&
              callActions.map((a, i) => (
                <button key={i} className={a.type === 'ron' ? 'primary' : a.type === 'pass' ? '' : 'on'} onClick={() => act(a)}>
                  {callLabel(a)}
                </button>
              ))}
            {!myTurn && !myCallPending && game.phase !== 'over' && <span className="hint">…</span>}
            {myTurn && !riichiMode && <span className="hint">捨てる牌をクリック</span>}
          </div>
        </div>
      </section>

      {game.phase === 'over' && !final && <ResultOverlay game={game} onNext={nextHand} />}
      {final && <FinalOverlay ranking={final} onRestart={restart} />}
    </div>
  );
}

function ResultOverlay({ game, onNext }: { game: GameState; onNext: () => void }) {
  const r = game.result!;
  return (
    <div className="overlay">
      <div className="card">
        {r.type === 'ryuukyoku' ? (
          <>
            <h2>流局</h2>
            <p>聴牌: {r.tenpai.length ? r.tenpai.map((s) => SEAT_NAME[s]).join('、') : 'なし'}</p>
          </>
        ) : (
          <>
            <h2>{SEAT_NAME[r.winner]} {r.type === 'tsumo' ? 'ツモ' : 'ロン'}</h2>
            <ul className="yaku">
              {r.hand.yakumanTotal > 0
                ? r.hand.yakuman.map((y) => <li key={y.name}>{y.name}</li>)
                : r.hand.yaku.map((y) => <li key={y.name}>{y.name} {y.han}翻</li>)}
            </ul>
            <p className="score-line">
              {r.hand.yakumanTotal > 0
                ? `役満${r.hand.yakumanTotal > 1 ? `×${r.hand.yakumanTotal}` : ''}`
                : `${r.hand.han}翻 ${r.hand.fu}符`}
              ／ {r.hand.score.total}点
            </p>
          </>
        )}
        <div className="delta">
          {r.scoreDelta.map((d, i) => (
            <span key={i} className={d >= 0 ? 'plus' : 'minus'}>
              {SEAT_NAME[i]}: {d >= 0 ? '+' : ''}{d}
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
            <li key={e.seat}>{e.rank}位 {SEAT_NAME[e.seat]} — {e.score}</li>
          ))}
        </ol>
        <button className="primary" onClick={onRestart}>もう一度</button>
      </div>
    </div>
  );
}
