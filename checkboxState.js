import { redis } from "./redis-connection.js";

export const CHECKBOX_KEY = "1M_check_box";
export const CHECKBOX_COUNT = 1000;

export async function getState() {
  const existingState = await redis.get(CHECKBOX_KEY);
  if (existingState) return JSON.parse(existingState);
  return new Array(CHECKBOX_COUNT).fill(false);
}

export async function updateState(index, checked) {
  const state = await getState();
  state[index] = checked;
  await redis.set(CHECKBOX_KEY, JSON.stringify(state));
}
