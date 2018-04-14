declare module 'p-memoize' {
  type Memoize = <T extends (...args: any[]) => any>(f: T) => T;

  const pMemoize: Memoize;

  export = pMemoize;
}
