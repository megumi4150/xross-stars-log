import { Card, CardCount } from "./types";
export type ImportedDeck = {
  code: string;
  name: string;
  leaders: Card[];
  mainDeck: CardCount[];
  tactics: Card[];
};
type NormalizedDeck = { officialDeckCode:string; leaders:Card[]; mainDeck:CardCount[]; tactics:Card[]; aceSummary:{cardId:string;name:string;count:number}[] };
/** Browser adapter: only calls the same-origin Vercel Function. The upstream API stays server-side. */
export class OfficialXrossStarsAdapter {
  extractCode(input: string) {
    const match = input.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/i);
    return match?.[0] || input.trim();
  }
  async import(codeOrUrl: string): Promise<ImportedDeck> {
    const code = this.extractCode(codeOrUrl);
    if (!/^[0-9a-f-]{36}$/i.test(code))
      throw new Error("公式デッキURLまたはUUIDを入力してください");
    let response: Response;
    try {
      response = await fetch(`/api/xross/deck/${code}`);
    } catch {
      throw new Error("デッキ取得サービスに接続できませんでした");
    }
    if (!response.ok)
      throw new Error(`公式デッキを取得できませんでした（${response.status}）`);
    const raw = (await response.json()) as NormalizedDeck;
    if (!Array.isArray(raw.leaders) || !Array.isArray(raw.mainDeck) || !Array.isArray(raw.tactics))
      throw new Error("公式デッキの形式が変更されています");
    return {
      code,
      name: `${raw.leaders.map((x) => x.name).join("・")} デッキ`,
      leaders: raw.leaders,
      mainDeck: raw.mainDeck,
      tactics: raw.tactics,
    };
  }
}
export const hashDeck = (leaders: Card[], main: CardCount[], tactics: Card[]) =>
  JSON.stringify({
    l: leaders.map((x) => x.id).sort(),
    m: main
      .map((x) => [x.id, x.count] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0])),
    t: tactics.map((x) => x.id).sort(),
  });
