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

const CPU_DELAY = 420;
const SEAT_NAME = ['あなた', 'CPU右', 'CPU対面', 'CPU左'];
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
  return (
    <div className={`info i${seat}${active ? ' active' : ''}`}>
      <span className="wind">{WIND_LABEL[seatWindOf(game, seat)]}</span>
      <span className="name">{SEAT_NAME[seat]}</span>
      <span className="score">{game.scores[seat]}</span>
      {game.dealer === seat && <span className="dealer">親</span>}
      {game.riichi[seat] && <span className="riichi-stick" title="リーチ" />}
    </div>
  );
}

export function App() {
  const [game, setGame] = useState<GameState>(() => createGame(newSeed()));
  const [final, setFinal] = useState<RankEntry[] | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);

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
  const seats: Seat[] = [0, 1, 2, 3];

  return (
    <div className="app">
      <div className="table">
        {/* 中央ハブ */}
        <div className="hub">
          <div className="round">{WIND_LABEL[game.wind]}{game.dealer + 1}局</div>
          <div className="sub">{game.honba}本場 ・ 供託{game.riichiSticks}</div>
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
              {r.hand.yakumanTotal > 0 ? (
                r.hand.yakuman.map((y) => <li key={y.name}>{y.name}</li>)
              ) : (
                <>
                  {r.hand.yaku.map((y) => <li key={y.name}>{y.name} <span>{y.han}翻</span></li>)}
                  {r.hand.dora.dora > 0 && <li>ドラ <span>{r.hand.dora.dora}</span></li>}
                  {r.hand.dora.aka > 0 && <li>赤ドラ <span>{r.hand.dora.aka}</span></li>}
                  {r.hand.dora.ura > 0 && <li>裏ドラ <span>{r.hand.dora.ura}</span></li>}
                </>
              )}
            </ul>
            <p className="score-line">
              {r.hand.yakumanTotal > 0
                ? `役満${r.hand.yakumanTotal > 1 ? `×${r.hand.yakumanTotal}` : ''}`
                : `${r.hand.han}翻 ${r.hand.fu}符`}
              <strong>{r.hand.score.total}点</strong>
            </p>
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
