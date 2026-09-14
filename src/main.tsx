import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { load, save, wipe } from "./db";
import {
  AppData,
  Card,
  Deck,
  DeckVersion,
  Match,
  Opponent,
  Round,
  emptyData,
  uid,
} from "./types";
import { OfficialXrossStarsAdapter, hashDeck } from "./deckAdapter";
import { CardMasterKind, OfficialXrossStarsCardMasterAdapter } from "./cardMasterAdapter";
import "./style.css";
type Tab = "record" | "decks" | "analysis" | "settings";
const today = () => new Date().toISOString().slice(0, 10);
const rate = (w: number, n: number) =>
  n ? `${Math.round((w / n) * 100)}%` : "—";
const sample: Card[] = [
  ["BP01-001", "うるか"],
  ["BP01-003", "橘ひなの"],
  ["BP01-044", "リンク・アサルト"],
  ["BP01-089", "先導者の証"],
  ["BP01-090", "エナジーチャージャー"],
].map(([id, name]) => ({ id, name, cardType: "main" }));
function App() {
  const [data, setData] = useState<AppData>(emptyData());
  const [tab, setTab] = useState<Tab>("record");
  const [toast, setToast] = useState("");
  useEffect(() => {
    load().then(setData);
  }, []);
  const update = (next: AppData, msg?: string) => {
    setData(next);
    save(next);
    if (msg) {
      setToast(msg);
      setTimeout(() => setToast(""), 2200);
    }
  };
  return (
    <>
      <header>
        <span className="mark">×</span>
        <div>
          <b>Xross Log</b>
          <small>試合後の30秒記録</small>
        </div>
      </header>
      <main>
        {tab === "record" && <Recorder data={data} update={update} />}{" "}
        {tab === "decks" && <Decks data={data} update={update} />}{" "}
        {tab === "analysis" && <Analysis data={data} />}{" "}
        {tab === "settings" && <Settings data={data} update={update} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <nav>
        {(
          [
            ["record", "記録"],
            ["decks", "デッキ"],
            ["analysis", "分析"],
            ["settings", "設定"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            key={id}
          >
            <i>
              {id === "record"
                ? "＋"
                : id === "decks"
                  ? "▦"
                  : id === "analysis"
                    ? "◔"
                    : "⚙"}
            </i>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
function Recorder({
  data,
  update,
}: {
  data: AppData;
  update: (x: AppData, m?: string) => void;
}) {
  const [carry, setCarry] = useState(true),
    [date, setDate] = useState(today()),
    [type, setType] = useState<"フリー" | "大会">("フリー"),
    [event, setEvent] = useState(""),
    [version, setVersion] = useState(data.versions[0]?.id || ""),
    [leaders, setLeaders] = useState<Card[]>([]),
    [aces, setAces] = useState<Card[]>([]),
    [r, setR] = useState<Round[]>([]),
    [firstOrder, setFirstOrder] = useState<"先攻" | "後攻" | "">(""),
    [note, setNote] = useState(""),
    [picker, setPicker] = useState<CardMasterKind | "">(""),
    [roundPicker, setRoundPicker] = useState<{roundId:string;side:"my"|"opponent"} | null>(null),
    [master, setMaster] = useState<Record<CardMasterKind, Card[]>>({ leader: [], ace: [], tactics: [] }),
    [masterLoading, setMasterLoading] = useState(false),
    [masterError, setMasterError] = useState("");
  const addRound = (result: "WIN" | "LOSE") => {
    if (r.filter((x) => x.result === result).length >= 2 || r.length >= 3)
      return;
    if (!firstOrder) return;
    const prev = r.at(-1);
    const order = r.length === 0 ? firstOrder : prev!.result === "LOSE" ? "先攻" : "後攻";
    setR([
      ...r,
      {
        id: uid(),
        roundNumber: (r.length + 1) as 1 | 2 | 3,
        result,
        order,
        orderSource: r.length ? "auto" : "manual",
        aceInvolvements: [],
      },
    ]);
  };
  const removeRound = (id: string) => {
    setR((current) => current.filter((round) => round.id !== id));
  };
  const reset = () => {
    setLeaders([]);
    setAces([]);
    setR([]);
    setFirstOrder("");
    setNote("");
  };
  const submit = (next: boolean) => {
    if (!version || r.length < 2 || leaders.length !== 4) {
      alert("使用デッキ・相手Leader・最低2ラウンドを入力してください");
      return;
    }
    const wins = r.filter((x) => x.result === "WIN").length,
      opponent: Opponent = {
        id: uid(),
        leaderIds: leaders.map((leader) => leader.id),
        leaders: leaders.map((leader) => leader.name),
        leaderCards: leaders,
        aces: aces.map((card) => ({ cardId: card.id, name: card.name, count: "?" })),
        displayLabel: leaders.map((leader) => leader.name).join(" / "),
        lastUsedAt: new Date().toISOString(),
      };
    const match: Match = {
      id: uid(),
      playedAt: date,
      matchType: type,
      tournamentName: event,
      deckVersionId: version,
      opponentId: opponent.id,
      result: wins >= 2 ? "WIN" : "LOSE",
      rounds: r,
      note,
      createdAt: new Date().toISOString(),
    };
    update(
      {
        ...data,
        opponents: [opponent, ...data.opponents],
        matches: [match, ...data.matches],
      },
      next ? "保存しました。次の対戦を記録できます" : "戦績を保存しました",
    );
    if (next) reset();
  };
  const v = data.versions.find((x) => x.id === version);
  const openPicker = async (kind: CardMasterKind) => {
    setPicker(kind); setMasterError("");
    if (master[kind].length) return;
    setMasterLoading(true);
    try {
      const cards = await new OfficialXrossStarsCardMasterAdapter().list(kind);
      setMaster((current) => ({ ...current, [kind]: cards }));
    }
    catch (error) { setMasterError(error instanceof Error ? error.message : "カード一覧を取得できませんでした"); }
    finally { setMasterLoading(false); }
  };
  const uniqueCards = (cards:Card[]) => [...new Map(cards.map((card) => [card.name, card])).values()];
  const openRoundPicker = async (roundId:string, side:"my"|"opponent") => {
    setRoundPicker({roundId, side}); setMasterError("");
    if (side === "my") return;
    if (master.tactics.length) return;
    setMasterLoading(true);
    try {
      const cards = await new OfficialXrossStarsCardMasterAdapter().list("tactics");
      setMaster((current) => ({ ...current, tactics: cards }));
    } catch (error) { setMasterError(error instanceof Error ? error.message : "カード一覧を取得できませんでした"); }
    finally { setMasterLoading(false); }
  };
  return (
    <section className="recorder">
      <h1>対戦を記録</h1>
      <p className="hint">試合中の入力はせず、終了後に記録します。</p>
      <div className="card">
        <div className="row">
          <label>
            日付
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            種別
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option>フリー</option>
              <option>大会</option>
            </select>
          </label>
        </div>
        {type === "大会" && (
          <input
            placeholder="大会名（任意）"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
          />
        )}
        <label>
          使用デッキ
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            <option value="">選択してください</option>
            {data.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {data.decks.find((d) => d.id === v.deckId)?.name}
              </option>
            ))}
          </select>
        </label>
        {v && (
          <small>
            {v.leaders.map((x) => x.name).join(" / ")} ·{" "}
            {rate(
              data.matches.filter(
                (m) => m.deckVersionId === v.id && m.result === "WIN",
              ).length,
              data.matches.filter((m) => m.deckVersionId === v.id).length,
            )}
          </small>
        )}
        <label className="switch">
          <input
            type="checkbox"
            checked={carry}
            onChange={(e) => setCarry(e.target.checked)}
          />{" "}
          前回の共通情報を引き継ぐ
        </label>
      </div>
      <div className="card">
        <h2>相手構成</h2>
        <p className="hint">使用カードを選択すると、公式カードマスターの画像一覧を開きます。</p>
        <div className="card-buttons">
          <button type="button" onClick={() => openPicker("leader")}>使用リーダーを選択 <b>{leaders.length}/4</b></button>
          <button type="button" onClick={() => openPicker("ace")}>使用ACEを選択 <b>{aces.length}/8</b></button>
        </div>
        <SelectedCards label="使用リーダー" cards={leaders} />
        <SelectedCards label="使用ACE" cards={aces} />
        {data.opponents.length > 0 && (
          <div className="chips">
            {data.opponents.slice(0, 4).map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setLeaders(o.leaderCards || o.leaders.map((name, i) => ({ id: o.leaderIds[i] || `saved-${o.id}-${i}`, name, cardType: "leader" })));
                  setAces(o.aces.map((ace) => ({ id: ace.cardId, name: ace.name, cardType: "ace", isAce: true })));
                }}
              >
                最近: {o.displayLabel}
              </button>
            ))}
          </div>
        )}
      </div>
      {picker && <CardPickerModal title={picker === "leader" ? "使用リーダー" : "使用ACE"} kind={picker} cards={master[picker]} selected={picker === "leader" ? leaders : aces} max={picker === "leader" ? 4 : 8} loading={masterLoading} error={masterError} onClose={() => setPicker("")} onKindChange={openPicker} onChange={(cards) => picker === "leader" ? setLeaders(cards) : setAces(cards)} />}
      <div className="card">
        <h2>
          Round <small>R2以降は前ラウンド敗者が先攻です</small>
        </h2>
        {!firstOrder && (
          <div className="order-question">
            <b>最初に確認：この試合は先攻でしたか？</b>
            <div className="split">
              <button className="primary" onClick={() => setFirstOrder("先攻")}>先攻だった</button>
              <button onClick={() => setFirstOrder("後攻")}>後攻だった</button>
            </div>
          </div>
        )}
        {firstOrder && r.length === 0 && (
          <div className="round-start"><b>R1 · 自分は{firstOrder}</b><small>結果を入力してください</small></div>
        )}
        {r.map((x, i) => (
          <div className="round" key={x.id}>
            <b>R{i + 1}</b>
            <span className={x.result === "WIN" ? "win" : "lose"}>
              {x.result}
            </span>
            <em>
              {x.order} {x.orderSource === "auto" && "（自動）"}
            </em>
            <button className="undo" type="button" onClick={() => removeRound(x.id)}>このRoundを取り消す</button>
            <TacticButton label="自分の選択したTACTICS" selected={x.myTactic} onClick={() => openRoundPicker(x.id, "my")} />
            <TacticButton label="相手の選択したTACTICS" selected={x.opponentTactic} onClick={() => openRoundPicker(x.id, "opponent")} />
            <div className="kill-turn" aria-label={`R${i + 1} キルターン`}>
              <small>キルターン</small>
              <div>
                {[1, 2, 3, 4, 5, 6].map((turn) => (
                  <button
                    type="button"
                    key={turn}
                    className={x.killTurn === turn ? "selected" : ""}
                    aria-pressed={x.killTurn === turn}
                    onClick={() => setR(r.map((y) => y.id === x.id ? { ...y, killTurn: y.killTurn === turn ? undefined : turn as Round["killTurn"] } : y))}
                  >
                    {turn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {firstOrder && r.length < 3 && (
          <div className="split">
            <button className="win" onClick={() => addRound("WIN")}>
              ＋ WIN
            </button>
            <button className="lose" onClick={() => addRound("LOSE")}>
              ＋ LOSE
            </button>
          </div>
        )}
      </div>
      {roundPicker && <TacticsPickerModal
        title={roundPicker.side === "my" ? "自分の選択したタクティクス" : "相手の選択したタクティクス"}
        sourceLabel={roundPicker.side === "my" ? "自分のデッキ内から選択" : "全TACTICSから選択（カード名は重複なし）"}
        cards={roundPicker.side === "my" ? uniqueCards(v?.tactics || []) : master.tactics}
        selected={r.find((round) => round.id === roundPicker.roundId)?.[roundPicker.side === "my" ? "myTactic" : "opponentTactic"]}
        loading={roundPicker.side === "opponent" && masterLoading}
        error={masterError}
        side={roundPicker.side}
        onClose={() => setRoundPicker(null)}
        onSideChange={(side) => openRoundPicker(roundPicker.roundId, side)}
        onChange={(value) => setR(r.map((round) => round.id === roundPicker.roundId ? (roundPicker.side === "my" ? {...round,myTactic:value} : {...round,opponentTactic:value}) : round))}
      />}
      <textarea
        placeholder="試合メモ（任意）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="actions">
        <button onClick={() => submit(false)}>保存</button>
        <button className="primary" onClick={() => submit(carry)}>
          保存して次へ
        </button>
      </div>
    </section>
  );
}
function Decks({
  data,
  update,
}: {
  data: AppData;
  update: (x: AppData, m?: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [detailId, setDetailId] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState<"recent" | "name" | "rate">("recent"),
    [source, setSource] = useState(""),
    [name, setName] = useState(""),
    [leaders, setLeaders] = useState(""),
    [main, setMain] = useState(""),
    [tactics, setTactics] = useState(""),
    [coverImage, setCoverImage] = useState<string | undefined>();
  const latest = (deckId: string) => data.versions.filter((v) => v.deckId === deckId).at(-1);
  const selected = data.decks.find((deck) => deck.id === detailId);
  const matchesFor = (versionId?: string) => data.matches.filter((match) => match.deckVersionId === versionId);
  const cards = (s: string, type: Card["cardType"]): Card[] =>
    s
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((name, i) => ({
        id: `manual-${type}-${name}-${i}`,
        name,
        cardType: type,
      }));
  const add = async () => {
    try {
      const code = source
        ? await new OfficialXrossStarsAdapter().import(source)
        : undefined;
      const ls = leaders ? cards(leaders, "leader") : code?.leaders || [];
      const md = main
        ? cards(main, "main").map((x) => ({ ...x, count: 1 }))
        : code?.mainDeck || [];
      const ts = tactics ? cards(tactics, "tactics") : code?.tactics || [];
      const deckName = name || code?.name || "名称未設定デッキ";
      if (ls.length !== 4) {
        alert("Leader 4枚を入力するか、公式デッキURLを読み込んでください");
        return;
      }
      const now = new Date().toISOString();
      const deck: Deck = selected
        ? { ...selected, name: deckName, coverImage, updatedAt: now }
        : { id: uid(), name: deckName, archived: false, createdAt: now, updatedAt: now, coverImage };
      const old = latest(deck.id);
      const version: DeckVersion = {
        id: old?.id || uid(),
        deckId: deck.id,
        versionNumber: 1,
        label: "",
        officialDeckCode: code?.code,
        contentHash: hashDeck(ls, md, ts),
        leaders: ls,
        mainDeck: md,
        tactics: ts,
        aceSummary: md
          .filter((x) => "isAce" in x && x.isAce)
          .map((x) => ({ cardId: x.id, name: x.name, count: x.count })),
        createdAt: old?.createdAt || now,
        changeSummary: [],
      };
      update(
        {
          ...data,
          decks: selected ? data.decks.map((item) => item.id === deck.id ? deck : item) : data.decks.concat(deck),
          versions: old ? data.versions.map((item) => item.id === old.id ? version : item) : data.versions.concat(version),
        },
        `${deckName} を保存しました`,
      );
      setDetailId(null);
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "登録できませんでした");
    }
  };
  const startNew = () => {
    setDetailId(null); setSource(""); setName(""); setLeaders(""); setMain(""); setTactics(""); setCoverImage(undefined); setOpen(true);
  };
  const edit = (deck: Deck) => {
    const version = latest(deck.id);
    setDetailId(deck.id); setName(deck.name); setSource(version?.officialDeckCode || "");
    setLeaders(version?.leaders.map((card) => card.name).join(", ") || "");
    setMain(version?.mainDeck.map((card) => card.name).join("\n") || "");
    setTactics(version?.tactics.map((card) => card.name).join(", ") || ""); setCoverImage(deck.coverImage); setOpen(true);
  };
  const setImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("画像ファイルを選択してください"); return; }
    const reader = new FileReader(); reader.onload = () => setCoverImage(String(reader.result)); reader.readAsDataURL(file);
  };
  const visibleDecks = data.decks.filter((deck) => deck.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ja");
    const av = latest(a.id), bv = latest(b.id);
    if (sort === "rate") return (matchesFor(bv?.id).filter((m) => m.result === "WIN").length / Math.max(matchesFor(bv?.id).length, 1)) - (matchesFor(av?.id).filter((m) => m.result === "WIN").length / Math.max(matchesFor(av?.id).length, 1));
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  if (open) {
    const version = selected ? latest(selected.id) : undefined;
    const matches = matchesFor(version?.id), wins = matches.filter((match) => match.result === "WIN").length;
    const previewCards = [...(version?.leaders || []), ...(version?.mainDeck || []), ...(version?.tactics || [])].slice(0, 15);
    return <section className="deck-screen deck-detail">
      <div className="deck-detail-head"><button type="button" onClick={() => setOpen(false)}>← 戻る</button><h1>{selected?.name || "デッキを追加"}</h1><button type="button" className="primary" onClick={add}>保存する</button></div>
      <div className="deck-visual">{coverImage ? <img src={coverImage} alt="デッキ画像" /> : <div className="deck-card-preview">{previewCards.length ? previewCards.map((card) => <span key={`${card.id}-${card.name}`}>{card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <b>{card.name.slice(0, 4)}</b>}</span>) : <b>デッキ画像</b>}</div>}</div>
      <label className="deck-image-upload">デッキ画像（任意）<span>画像を追加・変更<input type="file" accept="image/*" onChange={(e) => setImage(e.target.files?.[0])} /></span></label>
      <div className="deck-form">
        <label>デッキ名<input value={name} placeholder="例：青緑インペ" onChange={(e) => setName(e.target.value)} /></label>
        <label>公式デッキURL / UUID<input value={source} placeholder="https://..." onChange={(e) => setSource(e.target.value)} /><small>入力して保存すると公式構築を読み込みます。</small></label>
        <label>リーダー（4枚）<input value={leaders} placeholder="カード名をカンマ区切り" onChange={(e) => setLeaders(e.target.value)} /></label>
        <label>メインデッキ<textarea value={main} placeholder="カード名を改行またはカンマ区切り" onChange={(e) => setMain(e.target.value)} /></label>
        <label>TACTICS<input value={tactics} placeholder="カード名をカンマ区切り" onChange={(e) => setTactics(e.target.value)} /></label>
      </div>
      {selected && <div className="deck-performance"><b>成績</b><span>対戦: {matches.length}戦　勝: {wins}　勝率: {rate(wins, matches.length)}</span></div>}
    </section>;
  }
  return <section className="deck-screen">
    <div className="deck-tabs"><button className="active">自分のデッキ</button><button disabled>相手デッキ</button></div>
    <button className="deck-add" type="button" onClick={startNew}>＋ デッキを追加</button>
    <div className="deck-list-tools"><span>{visibleDecks.length}件のデッキ</span><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="recent">最近使用順</option><option value="name">名前順</option><option value="rate">勝率順</option></select><input value={query} placeholder="🔍 デッキ名で検索..." onChange={(e) => setQuery(e.target.value)} /></div>
    {visibleDecks.length === 0 ? <div className="deck-empty">🃏<b>まだデッキが登録されていません</b><small>「デッキを追加」から公式コードを読み込めます</small></div> : <div className="deck-list">{visibleDecks.map((deck) => {
      const version = latest(deck.id), matches = matchesFor(version?.id), wins = matches.filter((match) => match.result === "WIN").length, thumb = deck.coverImage || version?.leaders[0]?.imageUrl;
      return <button type="button" className="deck-row" key={deck.id} onClick={() => edit(deck)}><span className="deck-thumb">{thumb ? <img src={thumb} alt="" /> : "▦"}</span><b>{deck.name}</b><strong>{rate(wins, matches.length)}</strong><small>{matches.length}戦 {wins}勝 {matches.length - wins}敗</small><i>›</i><span className="deck-rate"><span style={{ width: `${matches.length ? (wins / matches.length) * 100 : 0}%` }} /></span></button>;
    })}</div>}
  </section>;
}
function Analysis({ data }: { data: AppData }) {
  const [filter, setFilter] = useState("");
  const ms = data.matches.filter((m) => !filter || m.deckVersionId === filter),
    wins = ms.filter((m) => m.result === "WIN").length,
    rs = ms.flatMap((m) => m.rounds),
    rw = rs.filter((r) => r.result === "WIN").length,
    numericKillTurns = rs.map((r) => r.killTurn).filter((turn): turn is Exclude<NonNullable<Round["killTurn"]>, "Over"> => typeof turn === "number"),
    avg = numericKillTurns.reduce((a, turn) => a + turn, 0) / (numericKillTurns.length || 1);
  const group = (values: { key: string; win: boolean }[]) =>
    Object.entries(
      values.reduce<Record<string, [number, number]>>((a, x) => {
        a[x.key] ??= [0, 0];
        a[x.key][0]++;
        if (x.win) a[x.key][1]++;
        return a;
      }, {}),
    );
  return (
    <section>
      <h1>分析</h1>
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="">すべてのデッキ</option>
        {data.versions.map((v) => (
          <option key={v.id} value={v.id}>
            {data.decks.find((d) => d.id === v.deckId)?.name}
          </option>
        ))}
      </select>
      <div className="metrics">
        <Metric label="総対戦" value={`${ms.length}`} />
        <Metric label="Match 勝率" value={rate(wins, ms.length)} />
        <Metric label="Round 勝率" value={rate(rw, rs.length)} />
        <Metric
          label="平均キルT"
          value={numericKillTurns.length ? avg.toFixed(1) : "—"}
        />
      </div>
      <Report
        title="構築別"
        rows={data.versions.map((v) => {
          const x = ms.filter((m) => m.deckVersionId === v.id);
          return [
            v.label,
            `${rate(x.filter((m) => m.result === "WIN").length, x.length)} · ${x.length}戦`,
          ];
        })}
      />
      <Report
        title="TACTICS（自分の選択）"
        rows={group(
          rs
            .filter((r) => r.myTactic)
            .map((r) => ({ key: r.myTactic!, win: r.result === "WIN" })),
        ).map(([k, [n, w]]) => [k, `${rate(w, n)} · ${n}回`])}
      />
      <Report
        title="対面 Leader"
        rows={group(
          ms.map((m) => ({
            key:
              data.opponents.find((o) => o.id === m.opponentId)?.displayLabel ||
              "未登録",
            win: m.result === "WIN",
          })),
        ).map(([k, [n, w]]) => [k, `${rate(w, n)} · ${n}戦`])}
      />
      <Report
        title="先攻 / 後攻"
        rows={group(
          rs.map((r) => ({ key: r.order, win: r.result === "WIN" })),
        ).map(([k, [n, w]]) => [k, `${rate(w, n)} · ${n}R`])}
      />
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function TacticButton({ label, selected, onClick }: {label:string;selected?:string;onClick:()=>void}) {
  return <button type="button" className="tactic-button" onClick={onClick}><small>{label}</small><b>{selected || "選択する"}</b></button>;
}
function TacticsPickerModal({
  title, sourceLabel, cards, selected, loading, error, side, onClose, onSideChange, onChange,
}: {title:string;sourceLabel:string;cards:Card[];selected?:string;loading:boolean;error:string;side:"my"|"opponent";onClose:()=>void;onSideChange:(side:"my"|"opponent")=>void;onChange:(value?:string)=>void}) {
  return <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className="picker-modal tactics-modal">
      <div className="picker-head"><div><h2>{title}</h2><small>{sourceLabel}</small></div><button type="button" className="close" onClick={onClose} aria-label="閉じる">×</button></div>
      {loading ? <p className="picker-status">公式カード一覧を読み込み中…</p> : error ? <p className="picker-status error">{error}</p> : <div className="picker-grid tactics-grid">{cards.map((card) => <button type="button" key={card.id} className={selected === card.name ? "chosen" : ""} onClick={() => { onChange(card.name); onClose(); }}>{card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <span className="card-fallback">◆</span>}<b>{card.name}</b>{selected === card.name && <em>✓</em>}</button>)}</div>}
      <div className="picker-tabs"><button type="button" className={side === "my" ? "active" : ""} onClick={() => onSideChange("my")}>自分の選択</button><button type="button" className={side === "opponent" ? "active" : ""} onClick={() => onSideChange("opponent")}>相手の選択</button></div>
      <button type="button" className="picker-confirm" onClick={onClose}>決定</button>
    </div>
  </div>;
}
function SelectedCards({ label, cards }: { label:string; cards:Card[] }) {
  if (!cards.length) return null;
  return <div className="selected-cards"><small>{label}</small><div>{cards.map((card) => <span key={card.id}>{card.imageUrl && <img src={card.imageUrl} alt="" />}<b>{card.name}</b></span>)}</div></div>;
}
function CardPickerModal({
  title, kind, cards, selected, max, loading, error, onClose, onKindChange, onChange,
}: { title:string; kind:CardMasterKind; cards:Card[]; selected:Card[]; max:number; loading:boolean; error:string; onClose:()=>void; onKindChange:(kind:CardMasterKind)=>void; onChange:(cards:Card[])=>void }) {
  const [color, setColor] = useState("all");
  const colors = [["all", "すべて"], ["red", "赤"], ["blue", "青"], ["yellow", "黄"], ["green", "緑"]] as const;
  const visibleCards = color === "all" ? cards : cards.filter((card) => card.color === color);
  const toggle = (card:Card) => {
    const exists = selected.some((selectedCard) => selectedCard.id === card.id);
    if (exists) onChange(selected.filter((selectedCard) => selectedCard.id !== card.id));
    else if (selected.length < max) onChange([...selected, card]);
  };
  return <div className="picker-backdrop" role="dialog" aria-modal="true" aria-label={title}>
    <div className="picker-modal">
      <div className="picker-head"><h2>{title}</h2><button type="button" className="close" onClick={onClose} aria-label="閉じる">×</button></div>
      <div className="picker-slots" aria-label="選択中のカード">{Array.from({length:max}, (_, index) => {
        const card = selected[index];
        return <button type="button" key={index} className={card ? "filled" : ""} disabled={!card} onClick={() => card && toggle(card)} aria-label={card ? `${card.name} を選択解除` : "未選択"}>
          {card && <><img src={card.imageUrl} alt={card.name} /><span>✓</span></>}
        </button>;
      })}</div>
      <div className="color-filter">{colors.map(([id, label]) => <button key={id} type="button" className={color === id ? `selected ${id}` : id} onClick={() => setColor(id)}>{label}</button>)}</div>
      {loading ? <p className="picker-status">公式カード一覧を読み込み中…</p> : error ? <p className="picker-status error">{error}</p> : <div className="picker-grid">{visibleCards.map((card) => {
        const position = selected.findIndex((selectedCard) => selectedCard.id === card.id);
        return <button type="button" key={card.id} className={position >= 0 ? "chosen" : ""} onClick={() => toggle(card)}>
          {card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <span className="card-fallback">◆</span>}
          <b>{card.name}</b>{position >= 0 && <em>{position + 1}</em>}
        </button>;
      })}</div>}
      <div className="picker-tabs"><button type="button" className={kind === "leader" ? "active" : ""} onClick={() => onKindChange("leader")}>リーダー</button><button type="button" className={kind === "ace" ? "active" : ""} onClick={() => onKindChange("ace")}>Ace</button></div>
      <button type="button" className="picker-confirm" onClick={onClose}>決定</button>
    </div>
  </div>;
}
function Report({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="card report">
      <h2>{title}</h2>
      {rows.length ? (
        rows.map((r, i) => (
          <div key={i}>
            <span>{r[0]}</span>
            <b>{r[1]}</b>
          </div>
        ))
      ) : (
        <p>記録が増えると表示されます</p>
      )}
    </div>
  );
}
function Settings({
  data,
  update,
}: {
  data: AppData;
  update: (x: AppData, m?: string) => void;
}) {
  const download = (name: string, text: string, type = "application/json") => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const csv = () => {
    const lines = [
      "date,type,deckVersion,result,opponent,round,roundResult,myTactics,opponentTactics,killTurn",
    ];
    data.matches.forEach((m) =>
      m.rounds.forEach((r) =>
        lines.push(
          [
            m.playedAt,
            m.matchType,
            m.deckVersionId,
            m.result,
            data.opponents.find((o) => o.id === m.opponentId)?.displayLabel ||
              "",
            r.roundNumber,
            r.result,
            r.myTactic || "",
            r.opponentTactic || "",
            r.killTurn || "",
          ]
            .map((x) => `"${String(x).replaceAll('"', '""')}"`)
            .join(","),
        ),
      ),
    );
    download("xross-log.csv", lines.join("\n"), "text/csv");
  };
  return (
    <section>
      <h1>設定</h1>
      <div className="card">
        <h2>データ管理</h2>
        <button
          onClick={() =>
            download(`xross-log-${today()}.json`, JSON.stringify(data, null, 2))
          }
        >
          バックアップを書き出す
        </button>
        <label className="file">
          バックアップから復元
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const x = JSON.parse(await f.text()) as AppData;
                if (!x.decks || !x.matches) throw 0;
                update(x, "復元しました");
              } catch {
                alert("有効なバックアップではありません");
              }
            }}
          />
        </label>
        <button onClick={csv}>CSV 出力</button>
        <button
          className="danger"
          onClick={async () => {
            if (confirm("全データを削除します。元に戻せません。")) {
              await wipe();
              update(emptyData(), "全データを削除しました");
            }
          }}
        >
          全データを削除
        </button>
      </div>
      <div className="card">
        <h2>アプリ情報</h2>
        <p>Xross Log MVP · IndexedDB にローカル保存</p>
        <p>オフライン閲覧対応 / ホーム画面に追加可能</p>
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
