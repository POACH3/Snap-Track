import { ArrowLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Loader } from "../../shared/ui/Loader.tsx";
import styles from "./Library.module.css";
import { useItemSearch } from "./use-items.ts";

/** Library › Items: the household's own names for the things it buys, alphabetically. */
export function ItemsScreen() {
  const [query, setQuery] = useState("");
  const search = useItemSearch(query);
  const items = search.data?.items ?? [];
  return (
    <div className={styles.screen}>
      <Link to="/library" className={styles.back}>
        <ArrowLeft size={18} aria-hidden /> Library
      </Link>
      <h1>Items</h1>
      <label className={styles.searchWrap}>
        <span className={styles.hidden}>Search items</span>
        <Search size={18} aria-hidden className={styles.searchIcon} />
        <input
          className={styles.search}
          value={query}
          placeholder="Search items"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      {search.isPending ? (
        <Loader label="Loading items…" />
      ) : search.isError ? (
        <EmptyState title="Can't load items">Check your connection, then try again.</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState title={query.trim() === "" ? "No items yet" : "No matching items"}>
          {query.trim() === ""
            ? "Items appear here once you name one on a receipt: tap a line's Use it, or its name."
            : "Try another name."}
        </EmptyState>
      ) : (
        <ul className={styles.list} aria-label="Items">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/library/items/${item.id}`} className={`${styles.row} ${styles.link}`}>
                <span className={styles.text}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.detail}>
                    {item.identifierCount === 1
                      ? "Recognized by 1 detail"
                      : `Recognized by ${item.identifierCount} details`}
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
