/**
 * Categorizes duration in minutes into bucket names
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} Duration bucket: '0-1h', '1-3h', '3-8h', '8h+'
 */
export const getDurationBucket = (durationMinutes) => {
  if (durationMinutes < 60) return '0-1h';
  if (durationMinutes < 180) return '1-3h';
  if (durationMinutes < 480) return '3-8h';
  return '8h+';
};

/**
 * Filters tickets by selected duration ranges
 * @param {array} tickets - Array of ticket objects
 * @param {array} selectedRanges - Selected duration ranges: ['0-1h', '1-3h', '3-8h', '8h+']
 * @returns {array} Filtered tickets matching any selected range
 */
export const filterByDurationRange = (tickets, selectedRanges) => {
  if (!selectedRanges || selectedRanges.length === 0) return tickets;

  return tickets.filter((ticket) => {
    const durationMinutes = ticket.durationMinutes;
    const bucket = getDurationBucket(durationMinutes);
    return selectedRanges.includes(bucket);
  });
};

/**
 * Filters tickets by entry time range
 * @param {array} tickets - Array of ticket objects
 * @param {Date|string} fromDate - Start date (inclusive)
 * @param {Date|string} toDate - End date (inclusive)
 * @returns {array} Filtered tickets within date range
 */
export const filterByEntryTimeRange = (tickets, fromDate, toDate) => {
  if (!fromDate || !toDate) return tickets;

  const from = new Date(fromDate);
  const to = new Date(toDate);
  // Set to end of toDate day
  to.setHours(23, 59, 59, 999);

  return tickets.filter((ticket) => {
    const entryTime = new Date(ticket.entryTime);
    return entryTime >= from && entryTime <= to;
  });
};

/**
 * Applies all filters conjunctively (AND logic) to ticket list
 * @param {array} tickets - Array of ticket objects
 * @param {object} filterConfig - Configuration object with keys:
 *   - searchTerm: string for plate/ticket number search
 *   - vehicleType: 'all' | 'car' | 'motorcycle'
 *   - dateFilter: 'all' | 'today' | 'week'
 *   - durationRanges: array of selected ranges ['0-1h', '1-3h', '3-8h', '8h+']
 *   - entryDateFrom: Date | null
 *   - entryDateTo: Date | null
 *   - sortBy: 'recent' | 'oldest' | 'duration'
 * @returns {array} Filtered and sorted tickets
 */
export const applyAllFilters = (tickets, filterConfig) => {
  let filtered = [...tickets];

  // Text search (ticket number or plate)
  if (filterConfig.searchTerm) {
    const term = filterConfig.searchTerm.toLowerCase();
    filtered = filtered.filter(
      (ticket) =>
        ticket.ticketNumber?.toLowerCase().includes(term) ||
        ticket.plateNumber?.toLowerCase().includes(term)
    );
  }

  // Vehicle type filter
  if (filterConfig.vehicleType && filterConfig.vehicleType !== 'all') {
    filtered = filtered.filter(
      (ticket) => ticket.vehicleType === filterConfig.vehicleType
    );
  }

  // Date filter (relative: today, week, etc.)
  if (filterConfig.dateFilter && filterConfig.dateFilter !== 'all') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filterConfig.dateFilter === 'today') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      filtered = filtered.filter((ticket) => {
        const entryTime = new Date(ticket.entryTime);
        return entryTime >= today && entryTime < tomorrow;
      });
    } else if (filterConfig.dateFilter === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      filtered = filtered.filter((ticket) => {
        const entryTime = new Date(ticket.entryTime);
        return entryTime >= weekAgo;
      });
    }
  }

  // Duration range filter (advanced)
  if (filterConfig.durationRanges && filterConfig.durationRanges.length > 0) {
    filtered = filterByDurationRange(filtered, filterConfig.durationRanges);
  }

  // Entry time range filter (advanced: custom date picker)
  if (filterConfig.entryDateFrom && filterConfig.entryDateTo) {
    filtered = filterByEntryTimeRange(
      filtered,
      filterConfig.entryDateFrom,
      filterConfig.entryDateTo
    );
  }

  // Sorting
  if (filterConfig.sortBy) {
    if (filterConfig.sortBy === 'recent') {
      filtered.sort(
        (a, b) => new Date(b.entryTime) - new Date(a.entryTime)
      );
    } else if (filterConfig.sortBy === 'oldest') {
      filtered.sort(
        (a, b) => new Date(a.entryTime) - new Date(b.entryTime)
      );
    } else if (filterConfig.sortBy === 'duration') {
      filtered.sort(
        (a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0)
      );
    }
  }

  return filtered;
};

/**
 * Calculates duration in minutes between two timestamps
 * @param {Date|string} startTime - Start timestamp
 * @param {Date|string} endTime - End timestamp (optional, defaults to now)
 * @returns {number} Duration in minutes (rounded up)
 */
export const calculateDuration = (startTime, endTime = new Date()) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diffMs = end - start;
  return Math.ceil(diffMs / (1000 * 60));
};

/**
 * Formats duration in minutes to human-readable string
 * @param {number} durationMinutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2h 30m", "45m")
 */
export const formatDuration = (durationMinutes) => {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
