declare global {
  function getMiniflareBindings<Bindings = Context>(): Bindings;
  function getMiniflareDurableObjectStorage(
    id: DurableObjectId
  ): Promise<DurableObjectStorage>;
  function getMiniflareFetchMock(): MockAgent;
  function flushMiniflareDurableObjectAlarms(
    ids: DurableObjectId[]
  ): Promise<void>;
}

export {};
