import { useState, useEffect, useCallback, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler,
  ArcElement,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { transactionService, ticketService } from "../services/api";
import Sidebar from "../components/common/Sidebar";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  ChartLegend,
  Filler,
  ArcElement
);

// Light Design tokens
const C = {
  bg:        "#f8fafc",
  surface:   "#ffffff",
  card:      "#f1f5f9",
  border:    "#e2e8f0",
  accent:    "#0ea5e9",
  green:     "#10b981",
  red:       "#ef4444",
  amber:     "#f59e0b",
  purple:    "#a855f7",
  cyan:      "#06b6d4",
  muted:     "#64748b",
  text:      "#0f172a",
  textSub:   "#475569",
};

// Helpers
const fmt = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n;
};

function toDay(dateStr) {
  return new Date(dateStr).toLocaleDateString("id-ID", { month: "short", day: "numeric" });
}

function dateRange(filter, custom) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === "today") return { from: today, to: now };
  if (filter === "7d")   { const d = new Date(today); d.setDate(d.getDate() - 6); return { from: d, to: now }; }
  if (filter === "30d")  { const d = new Date(today); d.setDate(d.getDate() - 29); return { from: d, to: now }; }
  if (filter === "custom" && custom.from && custom.to)
    return { from: new Date(custom.from), to: new Date(custom.to + "T23:59:59") };
  return { from: today, to: now };
}

// Data cache (keyed by date range)
const dataCache = {};

// Consolidated data fetching hook
function useAnalyticsData(filter, custom, typeFilter) {
  const [transactions, setTransactions] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const { from, to } = dateRange(filter, custom);
    const cacheKey = `${filter}-${custom.from}-${custom.to}-${typeFilter}`;

    if (dataCache[cacheKey]) {
      setTransactions(dataCache[cacheKey].transactions);
      setTickets(dataCache[cacheKey].tickets);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([
      transactionService.list({ limit: 500, type: typeFilter !== "all" ? typeFilter : undefined })
        .then(res => res.data.success ? res.data.data.transactions : [])
        .catch(() => []),
      ticketService.search({ limit: 500 })
        .then(res => res.data.success ? res.data.data.tickets : [])
        .catch(() => [])
    ]).then(([txns, tkts]) => {
      // Client-side filtering by date range
      const filteredTxns = txns.filter(t => {
        const d = new Date(t.createdAt);
        return d >= from && d <= to;
      });

      const filteredTkts = tkts.filter(t => {
        const d = new Date(t.entryTime);
        return d >= from && d <= to;
      });

      setTransactions(filteredTxns);
      setTickets(filteredTkts);

      dataCache[cacheKey] = { transactions: filteredTxns, tickets: filteredTkts };
      setLoading(false);
    }).catch(err => {
      setError(err.message || "Gagal memuat data");
      setLoading(false);
    });
  }, [filter, custom, typeFilter]);

  return { transactions, tickets, loading, error };
}

// Shared sub-components
function FilterBar({ filter, setFilter, custom, setCustom, showType, typeFilter, setTypeFilter }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
      {["today", "7d", "30d", "custom"].map((f) => (
        <button key={f}
          onClick={() => setFilter(f)}
          style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            background: filter === f ? C.accent : "transparent",
            color: filter === f ? "#fff" : C.textSub,
            border: `1px solid ${filter === f ? C.accent : C.border}`,
            transition: "all .15s",
          }}>
          {f === "today" ? "Hari Ini" : f === "7d" ? "7 Hari" : f === "30d" ? "30 Hari" : "Khusus"}
        </button>
      ))}
      {filter === "custom" && (
        <>
          <input type="date" value={custom.from} onChange={(e) => setCustom(p => ({ ...p, from: e.target.value }))}
            style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit" }} />
          <span style={{ color: C.muted, fontSize: 12 }}>→</span>
          <input type="date" value={custom.to} onChange={(e) => setCustom(p => ({ ...p, to: e.target.value }))}
            style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", fontSize: 12, fontFamily: "inherit" }} />
        </>
      )}
      {showType && (
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          style={{ background: C.surface, color: C.textSub, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
          <option value="all">Semua Tipe</option>
          <option value="income">Pendapatan</option>
          <option value="outcome">Pengeluaran</option>
        </select>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children, span = 1 }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 14,
      padding: "22px 24px",
      gridColumn: span === 2 ? "span 2" : "span 1",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: "-.01em" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: C.muted, fontSize: 13 }}>
      <span style={{ animation: "pulse 1.4s ease-in-out infinite" }}>Memuat data…</span>
    </div>
  );
}

// Chart 1: Income vs Outcome Over Time
function IncomeVsOutcome({ data, loading }) {
  const [filter, setFilter] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    data.forEach((t) => {
      const d = new Date(t.createdAt);
      if (d < from || d > to) return;
      const day = t.createdAt.slice(0, 10);
      if (!map[day]) map[day] = { date: day, income: 0, outcome: 0 };
      if (t.type === "income") map[day].income += t.amount;
      else map[day].outcome += t.amount;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: toDay(d.date) }));
  })();

  const chart = {
    labels: chartData.map(d => d.date),
    datasets: [
      {
        label: "Pendapatan",
        data: chartData.map(d => d.income),
        borderColor: C.green,
        backgroundColor: `${C.green}20`,
        fill: true,
        tension: 0.4,
        borderWidth: 2,
      },
      {
        label: "Pengeluaran",
        data: chartData.map(d => d.outcome),
        borderColor: C.red,
        backgroundColor: `${C.red}20`,
        fill: true,
        tension: 0.4,
        borderWidth: 2,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { ticks: { color: C.muted, font: { size: 11 }, callback: (v) => fmt(v) }, grid: { color: C.border, drawBorder: false } }
    }
  };

  return (
    <ChartCard title="Pendapatan vs Pengeluaran" subtitle="Tren arus kas harian" span={2}>
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Line data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 2: Transaction Distribution (Doughnut)
function TransactionDistribution({ data, loading }) {
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const inc = data.filter(t => {
      const d = new Date(t.createdAt);
      return d >= from && d <= to && t.type === "income";
    }).reduce((s, t) => s + t.amount, 0);
    const out = data.filter(t => {
      const d = new Date(t.createdAt);
      return d >= from && d <= to && t.type === "outcome";
    }).reduce((s, t) => s + t.amount, 0);
    return [inc, out];
  })();

  const chart = {
    labels: ["Pendapatan", "Pengeluaran"],
    datasets: [{
      data: chartData,
      backgroundColor: [C.green, C.red],
      borderColor: C.surface,
      borderWidth: 2,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1, callbacks: { label: (ctx) => fmt(ctx.parsed) } },
    }
  };

  return (
    <ChartCard title="Distribusi Transaksi" subtitle="Bagian pendapatan vs pengeluaran">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Doughnut data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 3: Active vs Completed (Doughnut)
function ActiveVsCompleted({ tickets, loading }) {
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const flt = tickets.filter(t => {
      const d = new Date(t.entryTime);
      return d >= from && d <= to;
    });
    return [
      flt.filter(t => t.status === "paid").length,
      flt.filter(t => t.status === "active").length
    ];
  })();

  const chart = {
    labels: ["Selesai", "Aktif"],
    datasets: [{
      data: chartData,
      backgroundColor: [C.green, C.amber],
      borderColor: C.surface,
      borderWidth: 2,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    }
  };

  return (
    <ChartCard title="Status Tiket" subtitle="Parkir aktif vs selesai">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Doughnut data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 4: Net Revenue
function NetRevenue({ data, loading }) {
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    data.forEach((t) => {
      const d = new Date(t.createdAt);
      if (d < from || d > to) return;
      const day = t.createdAt.slice(0, 10);
      if (!map[day]) map[day] = { date: day, net: 0 };
      map[day].net += t.type === "income" ? t.amount : -t.amount;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: toDay(d.date) }));
  })();

  const chart = {
    labels: chartData.map(d => d.date),
    datasets: [{
      label: "Keuntungan Bersih",
      data: chartData.map(d => d.net),
      backgroundColor: chartData.map(d => d.net >= 0 ? C.green : C.red),
      borderColor: chartData.map(d => d.net >= 0 ? C.green : C.red),
      borderWidth: 1,
      borderRadius: 4,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1, callbacks: { label: (ctx) => fmt(ctx.parsed.y) } },
    },
    scales: {
      x: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { ticks: { color: C.muted, font: { size: 11 }, callback: (v) => fmt(v) }, grid: { color: C.border, drawBorder: false } }
    }
  };

  return (
    <ChartCard title="Keuntungan Bersih" subtitle="Laba setelah biaya per hari">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Bar data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 5: Operator Activity
function OperatorActivity({ data, loading }) {
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    data.forEach((t) => {
      const d = new Date(t.createdAt);
      if (d < from || d > to) return;
      if (!map[t.operator]) map[t.operator] = { operator: t.operator, income: 0, outcome: 0 };
      if (t.type === "income") map[t.operator].income += 1;
      else map[t.operator].outcome += 1;
    });
    return Object.values(map);
  })();

  const chart = {
    labels: chartData.map(d => d.operator),
    datasets: [
      {
        label: "Transaksi Pendapatan",
        data: chartData.map(d => d.income),
        backgroundColor: C.green,
        borderColor: C.green,
        borderRadius: [0, 3, 3, 0],
      },
      {
        label: "Transaksi Pengeluaran",
        data: chartData.map(d => d.outcome),
        backgroundColor: C.red,
        borderColor: C.red,
        borderRadius: [0, 3, 3, 0],
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    scales: {
      x: { stacked: true, ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { stacked: true, ticks: { color: C.text, font: { size: 12 } }, grid: { color: "transparent", drawBorder: false } }
    },
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    }
  };

  return (
    <ChartCard title="Aktivitas Operator" subtitle="Transaksi dihandle per operator">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Bar data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 5: Parking Usage
function ParkingUsage({ tickets, loading }) {
  const [filter, setFilter] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    tickets.forEach((t) => {
      const d = new Date(t.entryTime);
      if (d < from || d > to) return;
      const day = t.entryTime.slice(0, 10);
      if (!map[day]) map[day] = { date: day, car: 0, motorcycle: 0 };
      map[day][t.vehicleType] += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: toDay(d.date) }));
  })();

  const chart = {
    labels: chartData.map(d => d.date),
    datasets: [
      {
        label: "Mobil",
        data: chartData.map(d => d.car),
        backgroundColor: C.accent,
        borderColor: C.accent,
        borderRadius: 3,
        borderSkipped: false,
      },
      {
        label: "Motor",
        data: chartData.map(d => d.motorcycle),
        backgroundColor: C.amber,
        borderColor: C.amber,
        borderRadius: 3,
        borderSkipped: false,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { stacked: true, ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { stacked: true, ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } }
    },
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    }
  };

  return (
    <ChartCard title="Penggunaan Parkir" subtitle="Kendaraan masuk per hari" span={2}>
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Bar data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 6: Peak Hours
function PeakHours({ tickets, loading }) {
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    for (let h = 0; h < 24; h++) map[h] = 0;
    tickets.forEach((t) => {
      const d = new Date(t.entryTime);
      if (d < from || d > to) return;
      map[new Date(t.entryTime).getHours()] += 1;
    });
    return Object.entries(map).map(([h, c]) => ({ hour: `${h}:00`, count: c }));
  })();

  const chart = {
    labels: chartData.map(d => d.hour),
    datasets: [{
      label: "Masuk",
      data: chartData.map(d => d.count),
      backgroundColor: C.purple,
      borderColor: C.purple,
      borderRadius: 3,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: C.muted, font: { size: 10 } }, grid: { color: C.border, drawBorder: false } },
      y: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } }
    }
  };

  return (
    <ChartCard title="Jam Padat" subtitle="Masuk kendaraan per jam" span={2}>
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Bar data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 7: Transaction Count
function TransactionCount({ data, loading }) {
  const [filter, setFilter] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [typeFilter, setTypeFilter] = useState("all");

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    data.filter(t => typeFilter === "all" || t.type === typeFilter).forEach((t) => {
      const d = new Date(t.createdAt);
      if (d < from || d > to) return;
      const day = t.createdAt.slice(0, 10);
      if (!map[day]) map[day] = { date: day, count: 0 };
      map[day].count += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, date: toDay(d.date) }));
  })();

  const chart = {
    labels: chartData.map(d => d.date),
    datasets: [{
      label: "Transaksi",
      data: chartData.map(d => d.count),
      borderColor: C.cyan,
      backgroundColor: `${C.cyan}20`,
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: C.cyan,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } }
    }
  };

  return (
    <ChartCard title="Jumlah Transaksi" subtitle="Jumlah transaksi per hari">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} showType typeFilter={typeFilter} setTypeFilter={setTypeFilter} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Line data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// Chart 8: Average Duration
function AvgDuration({ tickets, loading }) {
  const [filter, setFilter] = useState("7d");
  const [custom, setCustom] = useState({ from: "", to: "" });

  const chartData = (() => {
    const { from, to } = dateRange(filter, custom);
    const map = {};
    tickets.forEach((t) => {
      const d = new Date(t.entryTime);
      if (d < from || d > to) return;
      const day = t.entryTime.slice(0, 10);
      if (!map[day]) map[day] = { total: 0, count: 0 };
      map[day].total += t.durationMinutes || 0;
      map[day].count += 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { total, count }]) => ({
        date: toDay(date),
        avgMin: Math.round(total / count),
      }));
  })();

  const chart = {
    labels: chartData.map(d => d.date),
    datasets: [{
      label: "Rata-rata (menit)",
      data: chartData.map(d => d.avgMin),
      borderColor: C.amber,
      backgroundColor: `${C.amber}20`,
      fill: true,
      tension: 0.4,
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: C.amber,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: C.textSub, font: { size: 12 } } },
      tooltip: { backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text, borderColor: C.border, borderWidth: 1, callbacks: { label: (ctx) => ctx.parsed.y + " menit" } },
    },
    scales: {
      x: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } },
      y: { ticks: { color: C.muted, font: { size: 11 } }, grid: { color: C.border, drawBorder: false } }
    }
  };

  return (
    <ChartCard title="Durasi Parkir Rata-rata" subtitle="Rata-rata menit per kendaraan per hari">
      <FilterBar filter={filter} setFilter={setFilter} custom={custom} setCustom={setCustom} />
      {loading ? <Loader /> : <div style={{ position: "relative", height: 220 }}><Line data={chart} options={options} /></div>}
    </ChartCard>
  );
}

// KPI Summary Strip
function KPIStrip({ transactions, tickets, loading }) {
  const kpi = (() => {
    if (!transactions || !tickets) return null;
    const income  = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const outcome = transactions.filter(t => t.type === "outcome").reduce((s, t) => s + t.amount, 0);
    return {
      income, outcome, net: income - outcome,
      txnCount: transactions.length,
      activeTickets: tickets.filter(t => t.status === "active").length,
      totalTickets: tickets.length,
    };
  })();

  const cards = kpi ? [
    { label: "Pendapatan 30 Hari",  value: fmt(kpi.income),    color: C.green  },
    { label: "Pengeluaran 30 Hari", value: fmt(kpi.outcome),   color: C.red    },
    { label: "Keuntungan Bersih",   value: fmt(kpi.net),       color: kpi.net >= 0 ? C.green : C.red },
    { label: "Transaksi",           value: kpi.txnCount,       color: C.accent },
    { label: "Tiket Aktif",         value: kpi.activeTickets,  color: C.amber  },
    { label: "Total Tiket",         value: kpi.totalTickets,   color: C.cyan   },
  ] : Array(6).fill(null);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 12,
      marginBottom: 28,
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: "18px 16px",
          borderTop: `3px solid ${c?.color || C.border}`,
          transition: "border-color .2s",
        }}>
          {c ? (
            <>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: "'JetBrains Mono', monospace" }}>{c.value}</div>
            </>
          ) : (
            <div style={{ height: 40, background: C.border, borderRadius: 6, animation: "pulse 1.4s ease infinite" }} />
          )}
        </div>
      ))}
    </div>
  );
}

// Root Analytics Page
export default function Analytics() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState("30d");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [typeFilter, setTypeFilter] = useState("all");

  const { transactions, tickets, loading, error } = useAnalyticsData(filter, custom, typeFilter);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div style={{ marginLeft: "260px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        select option { background: ${C.surface}; color: ${C.text}; }
      `}</style>

      {/* Header */}
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: "16px 24px",
        position: "sticky",
        top: 0,
        zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <button 
            onClick={() => setSidebarOpen(true)}
            style={{
              display: "none",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.text,
              fontSize: 18,
              padding: 4,
              "@media (max-width: 1024px)": { display: "block" }
            }}
          >
            <i className="fas fa-bars"></i>
          </button>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", color: C.text }}>
            Statistik
          </h1>
          <span style={{
            background: `${C.accent}22`, color: C.accent,
            fontSize: 11, fontWeight: 600, padding: "3px 10px",
            borderRadius: 20, border: `1px solid ${C.accent}44`,
            letterSpacing: ".04em", textTransform: "uppercase"
          }}>Live</span>
        </div>
        <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14 }}>
          Wawasan keuangan &amp; operasional parkir Anda, didukung oleh data transaksi dan tiket.
        </p>
      </div>

      {/* Main Content */}
      <div style={{ padding: "32px 32px 64px" }}>

      {error && (
        <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: 8, padding: 12, marginBottom: 16, color: C.red, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <KPIStrip transactions={transactions} tickets={tickets} loading={loading} />

      {/* Chart grid - Ordered by importance */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      }}>
        <IncomeVsOutcome data={transactions} loading={loading} />
        <TransactionDistribution data={transactions} loading={loading} />
        <ActiveVsCompleted tickets={tickets} loading={loading} />
        <NetRevenue data={transactions} loading={loading} />
        <ParkingUsage tickets={tickets} loading={loading} />
        <PeakHours tickets={tickets} loading={loading} />
        <TransactionCount data={transactions} loading={loading} />
        <AvgDuration tickets={tickets} loading={loading} />
        <OperatorActivity data={transactions} loading={loading} />
      </div>
      </div>
      </div>
    </div>
  );
}