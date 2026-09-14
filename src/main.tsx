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
    [leaders, setLeaders] = useState<string[]>([]),
    [ace, setAce] = useState(""),
    [r, setR] = useState<Round[]>([]),
    [note, setNote] = useState("");
  const addRound = (result: "WIN" | "LOSE") => {
    if (r.filter((x) => x.result === result).length >= 2 || r.length >= 3)
      return;
    const prev = r.at(-1);
    const order =
      r.length === 0 ? "先攻" : prev!.result === "LOSE" ? "先攻" : "後攻";
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
  const reset = () => {
    setLeaders([]);
    setAce("");
    setR([]);
    setNote("");
  };
  const submit = (next: boolean) => {
    if (!version || r.length < 2 || !leaders.length) {
      alert("使用デッキ・相手Leader・最低2ラウンドを入力してください");
      return;
    }
    const wins = r.filter((x) => x.result === "WIN").length,
      opponent: Opponent = {
        id: uid(),
        leaderIds: leaders,
        leaders,
        aces: ace ? [{ cardId: ace, name: ace, count: "?" }] : [],
        displayLabel: leaders.join(" / "),
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
  return (
    <section>
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
                {data.decks.find((d) => d.id === v.deckId)?.name} · {v.label}
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
        <input
          placeholder="Leader 4枚（例：橘ひなの / うるか …）"
          value={leaders.join(" / ")}
          onChange={(e) =>
            setLeaders(
              e.target.value
                .split("/")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 4),
            )
          }
        />
        <input
          placeholder="ACE（不明なら空欄でOK）"
          value={ace}
          onChange={(e) => setAce(e.target.value)}
        />
        {data.opponents.length > 0 && (
          <div className="chips">
            {data.opponents.slice(0, 4).map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setLeaders(o.leaders);
                  setAce(o.aces[0]?.name || "");
                }}
              >
                最近: {o.displayLabel}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h2>
          Round <small>R2以降は前ラウンド敗者が先攻</small>
        </h2>
        {r.map((x, i) => (
          <div className="round" key={x.id}>
            <b>R{i + 1}</b>
            <span className={x.result === "WIN" ? "win" : "lose"}>
              {x.result}
            </span>
            <em>
              {x.order} {x.orderSource === "auto" && "（自動）"}
            </em>
            <CardChoice
              label="自分TACTICS"
              cards={v?.tactics || []}
              selected={x.myTactic}
              onChange={(myTactic) =>
                setR(r.map((y) => (y.id === x.id ? { ...y, myTactic } : y)))
              }
            />
            <CardChoice
              label="相手TACTICS"
              cards={v?.tactics || []}
              selected={x.opponentTactic}
              onChange={(opponentTactic) =>
                setR(
                  r.map((y) => (y.id === x.id ? { ...y, opponentTactic } : y)),
                )
              }
            />
            <input
              className="turn"
              type="number"
              min="1"
              placeholder="キルT"
              value={x.killTurn || ""}
              onChange={(e) =>
                setR(
                  r.map((y) =>
                    y.id === x.id ? { ...y, killTurn: +e.target.value } : y,
                  ),
                )
              }
            />
          </div>
        ))}
        {r.length < 3 && (
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
    [source, setSource] = useState(""),
    [name, setName] = useState(""),
    [leaders, setLeaders] = useState(""),
    [main, setMain] = useState(""),
    [tactics, setTactics] = useState("");
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
      const hash = hashDeck(ls, md, ts),
        deck =
          data.decks.find((d) => d.name === deckName) ||
          ({
            id: uid(),
            name: deckName,
            archived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as Deck);
      const old = data.versions.filter((v) => v.deckId === deck.id).at(-1);
      if (old?.contentHash === hash) {
        update(data, "同一構築のためバージョンは増やしません");
        setOpen(false);
        return;
      }
      const version: DeckVersion = {
        id: uid(),
        deckId: deck.id,
        versionNumber: (old?.versionNumber || 0) + 1,
        label: `v${(old?.versionNumber || 0) + 1}`,
        officialDeckCode: code?.code,
        contentHash: hash,
        leaders: ls,
        mainDeck: md,
        tactics: ts,
        aceSummary: md
          .filter((x) => "isAce" in x && x.isAce)
          .map((x) => ({ cardId: x.id, name: x.name, count: x.count })),
        createdAt: new Date().toISOString(),
        changeSummary: old
          ? [
              ...md
                .filter((x) => !old.mainDeck.some((y) => y.id === x.id))
                .map((x) => `IN: ${x.name}`),
              ...old.mainDeck
                .filter((x) => !md.some((y) => y.id === x.id))
                .map((x) => `OUT: ${x.name}`),
            ]
          : ["初期構築"],
      };
      update(
        {
          ...data,
          decks: data.decks.some((d) => d.id === deck.id)
            ? data.decks
            : data.decks.concat(deck),
          versions: [...data.versions, version],
        },
        `${deckName} ${version.label} を登録しました`,
      );
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "登録できませんでした");
    }
  };
  return (
    <section>
      <div className="title">
        <div>
          <h1>デッキ</h1>
          <p>構築をスナップショットとして保存</p>
        </div>
        <button className="primary" onClick={() => setOpen(!open)}>
          ＋ 追加
        </button>
      </div>
      {open && (
        <div className="card">
          <h2>デッキを追加</h2>
          <input
            placeholder="公式デッキURL / UUID（任意）"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <small>
            共有URLまたはUUIDを入力すると、同一Originの安全な取得Functionを通じて構築を読み込みます。
          </small>
          <input
            placeholder="デッキ名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Leader 4枚（カンマ区切り）"
            value={leaders}
            onChange={(e) => setLeaders(e.target.value)}
          />
          <textarea
            placeholder="Main Deck（カード名をカンマ/改行区切り）"
            value={main}
            onChange={(e) => setMain(e.target.value)}
          />
          <input
            placeholder="TACTICS（カンマ区切り）"
            value={tactics}
            onChange={(e) => setTactics(e.target.value)}
          />
          <button className="primary full" onClick={add}>
            確認して登録
          </button>
        </div>
      )}
      {data.decks.length === 0 ? (
        <div className="empty">まずはデッキを登録しましょう</div>
      ) : (
        data.decks.map((d) => (
          <div className="card" key={d.id}>
            <h2>{d.name}</h2>
            {data.versions
              .filter((v) => v.deckId === d.id)
              .map((v) => (
                <div className="version" key={v.id}>
                  <b>{v.label}</b>
                  <span>{v.leaders.map((x) => x.name).join(" / ")}</span>
                  <small>{v.changeSummary.join(" · ")}</small>
                </div>
              ))}
          </div>
        ))
      )}
    </section>
  );
}
function Analysis({ data }: { data: AppData }) {
  const [filter, setFilter] = useState("");
  const ms = data.matches.filter((m) => !filter || m.deckVersionId === filter),
    wins = ms.filter((m) => m.result === "WIN").length,
    rs = ms.flatMap((m) => m.rounds),
    rw = rs.filter((r) => r.result === "WIN").length,
    avg =
      rs.filter((r) => r.killTurn).reduce((a, r) => a + (r.killTurn || 0), 0) /
      (rs.filter((r) => r.killTurn).length || 1);
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
            {data.decks.find((d) => d.id === v.deckId)?.name} {v.label}
          </option>
        ))}
      </select>
      <div className="metrics">
        <Metric label="総対戦" value={`${ms.length}`} />
        <Metric label="Match 勝率" value={rate(wins, ms.length)} />
        <Metric label="Round 勝率" value={rate(rw, rs.length)} />
        <Metric
          label="平均キルT"
          value={rs.some((r) => r.killTurn) ? avg.toFixed(1) : "—"}
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
function CardChoice({
  label,
  cards,
  selected,
  onChange,
}: {
  label: string;
  cards: Card[];
  selected?: string;
  onChange: (name: string) => void;
}) {
  if (!cards.length)
    return (
      <input
        placeholder={`${label}（デッキ登録後に画像選択できます）`}
        value={selected || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <div className="card-choice">
      <small>{label}</small>
      <div>
        {cards.map((card) => (
          <button
            type="button"
            className={selected === card.name ? "chosen" : ""}
            key={card.id}
            onClick={() => onChange(card.name)}
          >
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.name} />
            ) : (
              <span>◆</span>
            )}
            <b>{card.name}</b>
          </button>
        ))}
      </div>
    </div>
  );
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
