import { os } from "../../../platform/http/rpc.ts";
import type { CatalogService } from "../application/catalog-service.ts";

export function createCatalogRouter(service: CatalogService) {
  return {
    items: {
      search: os.catalog.items.search.handler(({ input }) => ({ items: service.searchItems(input.query) })),

      get: os.catalog.items.get.handler(({ input, errors }) => {
        const detail = service.itemDetail(input.id);
        if (detail === undefined) throw errors.ITEM_NOT_FOUND();
        return detail;
      }),

      rename: os.catalog.items.rename.handler(({ input, errors }) => {
        const result = service.renameItem(input.id, input.name);
        if (!result.ok) throw errors.ITEM_NOT_FOUND();
        return { item: result.value };
      }),
    },

    itemIdentifiers: {
      remove: os.catalog.itemIdentifiers.remove.handler(({ input, errors }) => {
        const result = service.removeItemIdentifier(input.id);
        if (!result.ok) throw errors.IDENTIFIER_NOT_FOUND();
        return result.value;
      }),

      setState: os.catalog.itemIdentifiers.setState.handler(({ input, errors }) => {
        const result = service.setItemIdentifierState(input.id, input.state);
        if (!result.ok) throw errors.IDENTIFIER_NOT_FOUND();
        return result.value;
      }),
    },

    stores: {
      search: os.catalog.stores.search.handler(({ input }) => ({
        stores: service.searchStores(input.query),
      })),

      list: os.catalog.stores.list.handler(() => ({ stores: service.listStores() })),

      get: os.catalog.stores.get.handler(({ input, errors }) => {
        const detail = service.storeDetail(input.id);
        if (detail === undefined) throw errors.STORE_NOT_FOUND();
        return detail;
      }),

      rename: os.catalog.stores.rename.handler(({ input, errors }) => {
        const result = service.renameStore(input.id, input.name);
        if (!result.ok)
          throw result.error.kind === "name-taken" ? errors.STORE_NAME_TAKEN() : errors.STORE_NOT_FOUND();
        return { store: result.value };
      }),
    },

    identifiers: {
      add: os.catalog.identifiers.add.handler(({ input, errors }) => {
        const result = service.addIdentifier(input);
        if (result.ok) return result.value;
        switch (result.error.kind) {
          case "store-not-found":
            throw errors.STORE_NOT_FOUND();
          case "needs-answers":
            throw errors.NEEDS_ANSWERS({ data: { questions: result.error.questions } });
          case "invalid-identifier":
            throw errors.INVALID_IDENTIFIER();
          case "identifier-exists":
            throw errors.IDENTIFIER_EXISTS();
          case "shared-address":
            throw errors.SHARED_ADDRESS({ data: { alsoSavedFor: result.error.alsoSavedFor } });
        }
      }),

      remove: os.catalog.identifiers.remove.handler(({ input, errors }) => {
        const result = service.removeIdentifier(input.id);
        if (!result.ok) throw errors.IDENTIFIER_NOT_FOUND();
        return result.value;
      }),

      setState: os.catalog.identifiers.setState.handler(({ input, errors }) => {
        const result = service.setIdentifierState(input.id, input.state);
        if (!result.ok) throw errors.IDENTIFIER_NOT_FOUND();
        return result.value;
      }),
    },
  };
}
