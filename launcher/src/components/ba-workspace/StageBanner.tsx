// Stage banner — live per-status counts (sitemap zone 1: a status counter,
// not a bulk action). Ported from background.html #s12's `.ba-stage` block.
// When the selected file is In Review (SA), the banner swaps to the #s14
// variant naming that file's review.
import type { BaCounts, BaStatus } from '../../lib/api';

// Status pill dot — same color map as the file-tree status dots
// (draft purple / review amber / returned rose / approved green).
export function StatusDot({ status }: { status: BaStatus }) {
  const label =
    status === 'draft'
      ? 'Draft'
      : status === 'in_review'
        ? 'In Review'
        : status === 'returned'
          ? 'Returned'
          : 'Approved';
  return (
    <span
      className={`file-status ${status}`}
      role="img"
      aria-label={`Status: ${label}`}
    />
  );
}

type StageBannerProps = {
  counts: BaCounts;
  // #s14 variant — the file under SA review + its comment count. Null when no
  // file is selected or the selection isn't in review.
  review?: { filename: string; commentCount: number } | null;
};

export function StageBanner({ counts, review }: StageBannerProps) {
  return (
    <div className="ba-stage">
      <div className="ico" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path d="M14 3h7v7 M21 3l-9 9 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </svg>
      </div>
      <div className="body">
        {review ? (
          <>
            <div className="lbl">{review.filename} · Solution Architect review</div>
            <div className="ttl">
              SA is reading this file — {review.commentCount}{' '}
              {review.commentCount === 1 ? 'comment' : 'comments'} so far
            </div>
            <div className="sub">
              The body is read-only while the SA reviews. Use <b>Approve</b> to accept it, or{' '}
              <b>Return to BA</b> to flag it back for another pass.
            </div>
          </>
        ) : (
          <>
            <div className="lbl">Project Background · source documents</div>
            <div className="ttl">
              {counts.total} artifact{counts.total === 1 ? '' : 's'} · each moves through its own
              review
            </div>
            <div className="sub">
              Click any file to read it. Use <b>Send for review</b> to start the Solution
              Architect&rsquo;s review on that file. The SA can edit + leave comments; the file
              comes back <b>Returned</b> for revision or <b>Approved</b> when accepted.
            </div>
          </>
        )}
      </div>
      <div className="counts">
        <span className="count-pill">
          <StatusDot status="draft" />
          <b>{counts.draft}</b> Draft
        </span>
        <span className="count-pill">
          <StatusDot status="in_review" />
          <b>{counts.in_review}</b> In Review
        </span>
        <span className="count-pill">
          <StatusDot status="returned" />
          <b>{counts.returned}</b> Returned
        </span>
        <span className="count-pill">
          <StatusDot status="approved" />
          <b>{counts.approved}</b> Approved
        </span>
      </div>
    </div>
  );
}