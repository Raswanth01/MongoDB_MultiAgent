import { api } from "./api.js";

export const getRuns = () => api.sessions();

export const getRun = (id: string) =>
  api.session(id);

export const getRunTimeline = (id: string) =>
  api.timeline(id);