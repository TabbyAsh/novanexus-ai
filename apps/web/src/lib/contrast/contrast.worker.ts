import { compileProject } from "./compiler";
self.onmessage = (event: MessageEvent<{ id: number; project: unknown }>) => {
  try {
    self.postMessage({
      id: event.data.id,
      result: compileProject(event.data.project),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "Analysis failed.",
    });
  }
};
