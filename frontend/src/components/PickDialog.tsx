import { ArrowUpRight } from "@phosphor-icons/react";
import { safeWebsite } from "../api";
import { assetFor, webSearchUrl } from "../lib/planets";
import {
  categoryLabel,
  tagLabel,
  type Discovery,
  type Feedback,
  type Pick,
} from "../types";
import { Dialog } from "./Dialog";

export function PickDialog({
  pick,
  index,
  isPreview,
  agent,
  feedbackBusy,
  error,
  notice,
  onFeedback,
  onClose,
}: {
  pick: Pick;
  index: number;
  isPreview: boolean;
  agent: Discovery["agent"] | undefined;
  feedbackBusy: boolean;
  error: string;
  notice: string;
  onFeedback: (action: Feedback) => void;
  onClose: () => void;
}) {
  const website = safeWebsite(pick.entity.website_url);
  return (
    <Dialog title={pick.entity.name} onClose={onClose} className="pick-dialog">
      <img className="detail-planet" src={assetFor(index)} alt="" />
      <span className="eyebrow">
        {categoryLabel[pick.entity.category]}
        {isPreview ? " · Sample pick" : ""}
      </span>
      <p className="detail-explanation">{pick.explanation}</p>
      {pick.entity.description && <p>{pick.entity.description}</p>}
      {pick.shared_tags.length > 0 && (
        <div className="shared-tags" aria-label="Shared cultural tags">
          {pick.shared_tags.slice(0, 5).map((tag) => (
            <span key={tag} title={tag}>
              {tagLabel(tag)}
            </span>
          ))}
        </div>
      )}
      <a
        className="primary-button external-link"
        href={website || webSearchUrl(pick.entity)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {website ? "Visit official site" : "Search the web"}
        <ArrowUpRight size={22} />
      </a>
      {!isPreview && (
        <div className="feedback-actions">
          <button
            className="text-button"
            disabled={feedbackBusy}
            onClick={() => onFeedback("not_for_me")}
          >
            Not for me
          </button>
          <button
            className="text-button"
            disabled={feedbackBusy}
            onClick={() => onFeedback("already_know")}
          >
            I already know this
          </button>
        </div>
      )}
      {agent && (
        <section className="experience-plan">
          <h3>Your introduction</h3>
          {agent.status === "planned" ? (
            <ol>
              {agent.steps.map((step) => (
                <li key={step.entity_id}>{step.instruction}</li>
              ))}
            </ol>
          ) : (
            <p>
              {agent.question ||
                "The planner could not complete an introduction. The discoveries above are still available."}
            </p>
          )}
        </section>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
