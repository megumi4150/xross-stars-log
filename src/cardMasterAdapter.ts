import { Card } from "./types";

export type CardMasterKind = "leader" | "ace" | "tactics";

/** Browser adapter: card data is always obtained from our same-origin Function. */
export class OfficialXrossStarsCardMasterAdapter {
  async list(kind: CardMasterKind): Promise<Card[]> {
    const response = await fetch(`/api/xross/cards/${kind}`);
    if (!response.ok) throw new Error("カード一覧を取得できませんでした");
    const body = (await response.json()) as { cards?: Card[] };
    if (!Array.isArray(body.cards)) throw new Error("カード一覧の形式が変更されています");
    return body.cards;
  }
}
