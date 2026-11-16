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

      setCategory: os.catalog.items.setCategory.handler(({ input, errors }) => {
        const result = service.setItemCategory(input.id, input.categoryId);
        if (result.ok) return result.value;
        throw result.error.kind === "item-not-found" ? errors.ITEM_NOT_FOUND() : errors.CATEGORY_NOT_FOUND();
      }),

      setTags: os.catalog.items.setTags.handler(({ input, errors }) => {
        const result = service.setItemTags(input.id, input.tagIds);
        if (!result.ok) throw errors.ITEM_NOT_FOUND();
        return result.value;
      }),

      labels: os.catalog.items.labels.handler(({ input }) => ({
        items: [...service.itemLabels(input.ids)].map(([id, labels]) => ({
          id,
          categoryId: labels.categoryId,
          tagIds: [...labels.tagIds],
        })),
      })),
    },

    categories: {
      list: os.catalog.categories.list.handler(() => ({ categories: service.listCategories() })),

      add: os.catalog.categories.add.handler(({ input, errors }) => {
        const result = service.addCategory(input.name, input.parentId);
        if (result.ok) return { category: result.value };
        switch (result.error.kind) {
          case "parent-not-found":
            throw errors.PARENT_NOT_FOUND();
          case "too-deep":
            throw errors.TOO_DEEP();
          case "name-taken":
            throw errors.NAME_TAKEN();
        }
      }),

      rename: os.catalog.categories.rename.handler(({ input, errors }) => {
        const result = service.renameCategory(input.id, input.name);
        if (result.ok) return { category: result.value };
        throw result.error.kind === "name-taken" ? errors.NAME_TAKEN() : errors.CATEGORY_NOT_FOUND();
      }),

      move: os.catalog.categories.move.handler(({ input, errors }) => {
        const result = service.moveCategory(input.id, input.parentId);
        if (result.ok) return { category: result.value };
        switch (result.error.kind) {
          case "category-not-found":
            throw errors.CATEGORY_NOT_FOUND();
          case "invalid-parent":
            throw errors.INVALID_PARENT();
          case "name-taken":
            throw errors.NAME_TAKEN();
        }
      }),

      remove: os.catalog.categories.remove.handler(({ input, errors }) => {
        const result = service.removeCategory(input.id);
        if (!result.ok) throw errors.CATEGORY_NOT_FOUND();
        return { outcome: result.value };
      }),

      restore: os.catalog.categories.restore.handler(({ input, errors }) => {
        const result = service.restoreCategory(input.id);
        if (!result.ok) throw errors.CATEGORY_NOT_FOUND();
        return { category: result.value };
      }),
    },

    tags: {
      list: os.catalog.tags.list.handler(() => ({ tags: service.listTags() })),

      add: os.catalog.tags.add.handler(({ input, errors }) => {
        const result = service.addTag(input.name);
        if (!result.ok) throw errors.NAME_TAKEN();
        return { tag: result.value };
      }),

      rename: os.catalog.tags.rename.handler(({ input, errors }) => {
        const result = service.renameTag(input.id, input.name);
        if (result.ok) return { tag: result.value };
        throw result.error.kind === "name-taken" ? errors.NAME_TAKEN() : errors.TAG_NOT_FOUND();
      }),

      remove: os.catalog.tags.remove.handler(({ input, errors }) => {
        const result = service.removeTag(input.id);
        if (!result.ok) throw errors.TAG_NOT_FOUND();
        return { outcome: result.value };
      }),

      restore: os.catalog.tags.restore.handler(({ input, errors }) => {
        const result = service.restoreTag(input.id);
        if (!result.ok) throw errors.TAG_NOT_FOUND();
        return { tag: result.value };
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

      setDefaultCategory: os.catalog.stores.setDefaultCategory.handler(({ input, errors }) => {
        const result = service.setStoreDefaultCategory(input.id, input.categoryId);
        if (result.ok) return result.value;
        throw result.error.kind === "store-not-found"
          ? errors.STORE_NOT_FOUND()
          : errors.CATEGORY_NOT_FOUND();
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
