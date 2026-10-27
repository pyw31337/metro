export const parseSeoulDate = (dateStr: string): number => {
  if (!dateStr) return 0;

  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();

  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return new Date(
      `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
    ).getTime();
  }

  return 0;
};
