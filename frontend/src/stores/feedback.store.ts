import { defineStore } from "pinia";

export type FeedbackTone = "success" | "error" | "info";

export type FeedbackItem = {
  id: number;
  message: string;
  tone: FeedbackTone;
};

let nextFeedbackId = 1;

export const useFeedbackStore = defineStore("feedback", {
  state: () => ({
    items: [] as FeedbackItem[],
  }),
  actions: {
    notify(message: string, tone: FeedbackTone = "info", duration = 5000) {
      const id = nextFeedbackId++;
      this.items.push({ id, message, tone });

      if (duration > 0) {
        window.setTimeout(() => this.dismiss(id), duration);
      }

      return id;
    },
    success(message: string) {
      return this.notify(message, "success");
    },
    error(message: string) {
      return this.notify(message, "error", 6500);
    },
    dismiss(id: number) {
      this.items = this.items.filter((item) => item.id !== id);
    },
  },
});
