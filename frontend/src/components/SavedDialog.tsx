import { ArrowUpRight, BookmarkSimple } from "@phosphor-icons/react";
import { webSearchUrl } from "../lib/planets";
import { categoryLabel, type SavedPick } from "../types";
import { Dialog } from "./Dialog";

export function SavedDialog({
  saved,
  onClose,
}: {
  saved: SavedPick[];
  onClose: () => void;
}) {
  return (
    <Dialog title="Saved discoveries" onClose={onClose}>
      <p className="dialog-intro">
        Your finds, kept on this device. Sample picks are labelled separately.
      </p>
      {!saved.length ? (
        <div className="empty-saved">
          <BookmarkSimple size={34} weight="light" />
          <p>Keep something that catches your eye.</p>
        </div>
      ) : (
        <div className="saved-list">
          {saved.map((entry) => (
            <article key={entry.pick.entity.id}>
              <div>
                <span className="eyebrow">
                  {categoryLabel[entry.pick.entity.category]}
                  {entry.preview ? " · Sample" : ""}
                </span>
                <h3>{entry.pick.entity.name}</h3>
                <p>{entry.pick.explanation}</p>
              </div>
              <a
                href={webSearchUrl(entry.pick.entity)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Search the web for ${entry.pick.entity.name}`}
              >
                <ArrowUpRight size={22} />
              </a>
            </article>
          ))}
        </div>
      )}
    </Dialog>
  );
}
