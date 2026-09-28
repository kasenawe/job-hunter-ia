export function seniorityFromTitle(title: string): string | null {
  if (/\bstaff\b/i.test(title)) return "staff";
  if (/\bprincipal\b/i.test(title)) return "principal";
  if (/\b(director|head of|vp)\b/i.test(title)) return "director";
  if (/\bmanager\b/i.test(title)) return "manager";
  if (/\blead\b/i.test(title)) return "lead";
  if (/\bsenior\b|\bsr\./i.test(title)) return "senior";
  if (/\b(mid|intermediate)\b/i.test(title)) return "mid";
  if (/\bjunior\b|\bjr\./i.test(title)) return "junior";
  return null;
}
