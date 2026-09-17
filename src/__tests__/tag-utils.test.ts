import { describe, it, expect } from "vitest";
import {
  extractTagsAndComment,
  formatInitialCommentAndTags,
  removeTagFromText,
} from "@/lib/tag-utils";

describe("tag-utils: extractTagsAndComment", () => {
  it("повертає порожні дані для порожнього вводу", () => {
    expect(extractTagsAndComment("")).toEqual({ tags: [], comment: "" });
    expect(extractTagsAndComment("   ")).toEqual({ tags: [], comment: "" });
  });

  it("витягує українські та латинські хештеги з тексту", () => {
    const input =
      "Вечеря з друзями в ресторані #ресторан #день_народження #food2026";
    const result = extractTagsAndComment(input);

    expect(result.tags).toEqual(["ресторан", "день_народження", "food2026"]);
    expect(result.comment).toBe(input);
  });

  it("дедуплікує теги та переводить у нижній регістр", () => {
    const input = "#Авто #авто #АВТО заміна мастила #СТО #сто";
    const result = extractTagsAndComment(input);

    expect(result.tags).toEqual(["авто", "сто"]);
    expect(result.comment).toBe(input);
  });

  it("ігнорує самотній символ # без тексту або з пробілом", () => {
    const input = "Купив номер # 5 у черзі";
    const result = extractTagsAndComment(input);

    expect(result.tags).toEqual([]);
    expect(result.comment).toBe(input);
  });

  it("коректно працює з дефісами та підкресленнями", () => {
    const input = "Покупка #онлайн-замовлення #fast_delivery";
    const result = extractTagsAndComment(input);

    expect(result.tags).toEqual(["онлайн-замовлення", "fast_delivery"]);
  });

  it("обмежує довжину коментаря 500 символами", () => {
    const longText = "а".repeat(600) + " #тег";
    const result = extractTagsAndComment(longText);

    expect(result.comment.length).toBeLessThanOrEqual(500);
  });
});

describe("tag-utils: formatInitialCommentAndTags", () => {
  it("повертає коментар, якщо тегів немає", () => {
    expect(formatInitialCommentAndTags("Подарунок мамі", [])).toBe(
      "Подарунок мамі"
    );
  });

  it("формує рядок з тегів, якщо коментар порожній", () => {
    expect(formatInitialCommentAndTags(null, ["авто", "ремонт"])).toBe(
      "#авто #ремонт"
    );
  });

  it("не дублює теги, якщо вони вже написані в коментарі", () => {
    const comment = "Купив подарунок #свято";
    const tags = ["свято", "подарунок"];
    const result = formatInitialCommentAndTags(comment, tags);

    expect(result).toBe("Купив подарунок #свято #подарунок");
  });
});

describe("tag-utils: removeTagFromText", () => {
  it("видаляє вказаний тег з тексту", () => {
    const text = "Святкова вечеря #свято #ресторан смачно";
    const updated = removeTagFromText(text, "свято");

    expect(updated).toBe("Святкова вечеря #ресторан смачно");
  });

  it("коректно видаляє тег, навіть якщо передано з символом #", () => {
    const text = "Заміна гуми #авто";
    const updated = removeTagFromText(text, "#авто");

    expect(updated).toBe("Заміна гуми");
  });
});
