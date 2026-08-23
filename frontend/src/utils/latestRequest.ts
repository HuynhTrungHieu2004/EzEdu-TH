export function createLatestRequestGuard() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: (request: number) => request === generation,
    cancel: () => { generation += 1; },
  };
}
