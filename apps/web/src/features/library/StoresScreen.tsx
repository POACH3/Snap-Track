import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import styles from "./Library.module.css";
import { useStoreList } from "./use-stores.ts";

/** Library › Stores: every store from the receipts, alphabetically. */
export function StoresScreen() {
  const query = useStoreList();
  return (
    <div className={styles.screen}>
      <Link to="/library" className={styles.back}>
        <ArrowLeft size={18} aria-hidden /> Library
      </Link>
      <h1>Stores</h1>
      {query.isPending ? (
        <Loader label="Loading stores…" />
      ) : query.isError ? (
        <EmptyState title="Can't load stores">Check your connection, then try again.</EmptyState>
      ) : query.data.stores.length === 0 ? (
        <EmptyState title="No stores yet">
          Stores appear here once you confirm a receipt and choose its store.
        </EmptyState>
      ) : (
        <ul className={styles.list} aria-label="Stores">
          {query.data.stores.map((store) => (
            <li key={store.id}>
              <Link to={`/library/stores/${store.id}`} className={`${styles.row} ${styles.link}`}>
                <span className={styles.text}>
                  <span className={styles.name}>{store.name}</span>
                  <span className={styles.detail}>
                    {store.identifierCount === 1
                      ? "Recognized by 1 detail"
                      : `Recognized by ${store.identifierCount} details`}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden className={styles.chevron} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
