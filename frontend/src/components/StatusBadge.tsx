const TONE_BY_STATUS: Record<string, string> = {
  DRAFT: "tone-neutral",
  APPROVED: "tone-info",
  ACTIVE: "tone-success",
  SUBMITTED: "tone-info",
  ISSUED: "tone-info",
  PARTIALLY_RECEIVED: "tone-warning",
  RECEIVED: "tone-success",
  CLOSED: "tone-success",
  CONVERTED: "tone-success",
  SUSPENDED: "tone-warning",
  REJECTED: "tone-danger",
  BLACKLISTED: "tone-danger",
  CANCELLED: "tone-danger",
  INACTIVE: "tone-neutral",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONE_BY_STATUS[status] ?? "tone-neutral";
  return <span className={`badge ${tone}`}>{status.replace(/_/g, " ")}</span>;
}
