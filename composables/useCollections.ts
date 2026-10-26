import { ref } from "vue";
import { useToast } from "./useToast";

export interface CollectionItem {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string;
  isDefault: boolean;
  createdAt: number;
  postCount: number;
}

const collections = ref<CollectionItem[]>([
  {
    id: "all",
    name: "All Saved",
    icon: "bookmark",
    color: "#ffffff",
    keywords: "",
    isDefault: true,
    createdAt: 0,
    postCount: 0,
  },
]);

const isLoadingCollections = ref(false);

export function useCollections() {
  const { showToast } = useToast();

  async function fetchCollections() {
    isLoadingCollections.value = true;
    try {
      const res = await $fetch<{ collections: CollectionItem[] }>("/api/collections");
      if (res?.collections) {
        collections.value = res.collections;
      }
    } catch (err: any) {
      console.warn("Could not fetch collections:", err?.message || err);
    } finally {
      isLoadingCollections.value = false;
    }
  }

  async function createCollection(input: { name: string; icon?: string; keywords?: string }) {
    try {
      const res = await $fetch<{ status: string; collection: CollectionItem }>("/api/collections", {
        method: "POST",
        body: input,
      });
      await fetchCollections();
      showToast(`Collection "${res.collection.name}" created`, "success");
      return res.collection;
    } catch (err: any) {
      showToast(err?.data?.message || err.message || "Failed to create collection", "warning");
      throw err;
    }
  }

  async function updateCollection(input: { id: string; name?: string; icon?: string; keywords?: string }) {
    try {
      const res = await $fetch<{ status: string; collection: CollectionItem }>("/api/collections", {
        method: "PUT",
        body: input,
      });
      await fetchCollections();
      showToast(`Collection "${res.collection.name}" updated`, "success");
      return res.collection;
    } catch (err: any) {
      showToast(err?.data?.message || err.message || "Failed to update collection", "warning");
      throw err;
    }
  }

  async function deleteCollection(id: string) {
    if (id === "all") return;
    const target = collections.value.find((c) => c.id === id);
    const name = target?.name || id;

    try {
      await $fetch("/api/collections", {
        method: "DELETE",
        query: { id },
      });
      collections.value = collections.value.filter((c) => c.id !== id);
      showToast(`Collection "${name}" deleted`, "info");
      return true;
    } catch (err: any) {
      showToast(err?.data?.message || err.message || "Failed to delete collection", "warning");
      throw err;
    }
  }

  async function togglePostCollection(permalink: string, collectionId: string, isCurrentlyIn: boolean) {
    const action = isCurrentlyIn ? "remove" : "add";
    try {
      await $fetch("/api/collections/assign", {
        method: "POST",
        body: {
          permalink,
          collectionId,
          action,
        },
      });
      await fetchCollections();
      showToast(action === "add" ? "Added to collection" : "Removed from collection", "success");
    } catch (err: any) {
      showToast("Failed to update collection", "warning");
    }
  }

  return {
    collections,
    isLoadingCollections,
    fetchCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    togglePostCollection,
  };
}
