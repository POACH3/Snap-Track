import { ChevronRight, Package, Store, Tags } from "lucide-react";
import { Link } from "react-router";
import styles from "./Library.module.css";
import { useStoreList } from "./use-stores.ts";

/**
 * What the household has set and the app learns from, all editable (SPEC.md §6.5): stores and
 * items now; labels (categories, classes and tags) in Stage 4 part 3.
 */
export function LibraryScreen() {
  const stores = useStoreList();
  const count = stores.data?.stores.length;
  return (
    <div className={styles.screen}>
      <h1>Library</h1>
      <ul className={styles.list}>
        <li>
          <Link to="/library/stores" className={`${styles.row} ${styles.link}`}>
            <Store size={20} aria-hidden className={styles.icon} />
            <span className={styles.text}>
              <span className={styles.name}>Stores</span>
              <span className={styles.detail}>
                {count === undefined
                  ? "The stores from your receipts"
                  : count === 1
                    ? "1 store"
                    : `${count} stores`}
              </span>
            </span>
            <ChevronRight size={18} aria-hidden className={styles.chevron} />
          </Link>
        </li>
        <li>
          <Link to="/library/items" className={`${styles.row} ${styles.link}`}>
            <Package size={20} aria-hidden className={styles.icon} />
            <span className={styles.text}>
              <span className={styles.name}>Items</span>
              <span className={styles.detail}>Your own names for the things you buy</span>
            </span>
            <ChevronRight size={18} aria-hidden className={styles.chevron} />
          </Link>
        </li>
        <li className={`${styles.row} ${styles.later}`}>
          <Tags size={20} aria-hidden className={styles.icon} />
          <span className={styles.text}>
            <span className={styles.name}>Labels</span>
            <span className={styles.detail}>Categories, classes and tags. Coming soon.</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
