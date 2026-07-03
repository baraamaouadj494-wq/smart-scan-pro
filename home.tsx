import { useGetDocumentStats, useListDocuments, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  ScanLine, FileText, CheckCircle, Clock, AlertCircle,
  TrendingUp, Globe, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  uploaded: "#6b7280",
  processing: "#3b82f6",
  processed: "#8b5cf6",
  ocr_done: "#10b981",
  error: "#ef4444",
};

const LANG_COLORS = ["#06b6d4", "#8b5cf6", "#f59e0b"];

export default function Home() {
  const { data: stats, isLoading: statsLoading } = useGetDocumentStats();
  const { data: documents, isLoading: docsLoading } = useListDocuments(
    {},
    { query: { queryKey: getListDocumentsQueryKey({}) } }
  );

  const statCards = [
    { title: "Total Scans", value: stats?.total ?? 0, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
    { title: "Processed", value: stats?.processed ?? 0, icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
    { title: "OCR Completed", value: stats?.ocrDone ?? 0, icon: Clock, color: "text-primary", bg: "bg-primary/10" },
    { title: "Total Pages", value: stats?.totalPages ?? 0, icon: Layers, color: "text-purple-500", bg: "bg-purple-500/10" },
  ];

  // Status chart data
  const statusData = documents
    ? Object.entries(
        documents.reduce<Record<string, number>>((acc, d) => {
          acc[d.status] = (acc[d.status] ?? 0) + 1;
          return acc;
        }, {})
      ).map(([name, value]) => ({ name, value }))
    : [];

  // Language pie data
  const langData = stats?.languageBreakdown
    ? [
        { name: "Arabic", value: stats.languageBreakdown.ar },
        { name: "English", value: stats.languageBreakdown.en },
        { name: "Bilingual", value: stats.languageBreakdown.both },
      ].filter((d) => (d.value ?? 0) > 0)
    : [];

  const completionRate =
    stats && stats.total > 0 ? Math.round((stats.ocrDone / stats.total) * 100) : 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Your document intelligence cockpit.</p>
        </div>
        <Link href="/scan">
          <Button size="lg" className="w-full sm:w-auto font-medium shadow-primary/20 shadow-lg">
            <ScanLine className="w-5 h-5 mr-2" />
            New Scan
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          : statCards.map((stat, i) => (
              <Card key={i} className="border-border/50 bg-card/80 backdrop-blur-sm hover:border-primary/30 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-mono">{stat.value}</div>
                  {i === 2 && stats && stats.total > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-green-500" />
                      {completionRate}% completion rate
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Charts Row */}
      {!statsLoading && documents && documents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Status Bar Chart */}
          <Card className="md:col-span-2 border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Documents by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={statusData} barSize={32}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="transparent" />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#6b7280"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Language Pie Chart */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Languages
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {langData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={langData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {langData.map((_, idx) => (
                        <Cell key={idx} fill={LANG_COLORS[idx % LANG_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No language data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recent Documents */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Documents</h2>
          <Link href="/documents" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>

        {docsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : documents?.length === 0 ? (
          <div className="text-center py-16 px-4 border border-dashed rounded-xl border-border bg-muted/20">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <FileText className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium mb-2">No documents yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Scan your first document to extract text and analyze with AI.
            </p>
            <Link href="/scan">
              <Button variant="outline">Start Scanning</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents?.slice(0, 6).map((doc, i) => (
              <Link key={doc.id} href={`/documents/${doc.id}`}>
                <Card className={`overflow-hidden hover:border-primary/50 hover:shadow-md transition-all group cursor-pointer stagger-${(i % 4) + 1} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                  <div className="h-36 bg-muted relative overflow-hidden">
                    {doc.processedImageUrl || doc.originalImageUrl ? (
                      <img
                        src={doc.processedImageUrl || doc.originalImageUrl!}
                        alt={doc.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <FileText className="w-8 h-8 opacity-50" />
                      </div>
                    )}
                    {/* Status badge */}
                    <div className="absolute top-2 right-2">
                      {doc.status === "processing" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/90 text-white backdrop-blur flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Processing
                        </span>
                      )}
                      {doc.status === "ocr_done" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/90 text-primary-foreground backdrop-blur">
                          Ready
                        </span>
                      )}
                      {doc.status === "processed" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/90 text-white backdrop-blur">
                          Processed
                        </span>
                      )}
                      {doc.status === "error" && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-destructive/90 text-destructive-foreground backdrop-blur flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Error
                        </span>
                      )}
                    </div>
                    {/* Language tag */}
                    {doc.language && (
                      <div className="absolute bottom-2 left-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white backdrop-blur uppercase">
                          {doc.language}
                        </span>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold truncate text-sm">{doc.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(doc.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
