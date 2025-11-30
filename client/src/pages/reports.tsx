import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from "recharts";
import { FileDown } from "lucide-react";

interface BoxPlotData {
  machineId: string;
  machineName: string;
  operatorId: string;
  operatorName: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  count: number;
}

interface ReportResponse {
  data: BoxPlotData[];
}

export default function Reports() {
  const [reportGenerated, setReportGenerated] = useState(false);

  const { data: reportData, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/reports/efficiency"],
    enabled: reportGenerated,
  });

  const handleGenerateReport = () => {
    setReportGenerated(true);
  };

  if (!reportGenerated) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Production Efficiency Report</CardTitle>
            <CardDescription>
              Generate box plots showing efficiency distribution for each machine-operator pair
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleGenerateReport}
              size="lg"
              className="w-full gap-2"
              data-testid="button-generate-report"
            >
              <FileDown className="h-4 w-4" />
              Generate Report
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Production Efficiency Report</h1>
          <p className="text-muted-foreground">Generating efficiency analysis...</p>
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const boxPlotChartData = reportData?.data?.map((item) => ({
    name: `${item.machineName}\n(${item.operatorName})`,
    min: item.min,
    q1: item.q1,
    median: item.median,
    q3: item.q3,
    max: item.max,
    mean: item.mean,
  })) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Production Efficiency Report</h1>
          <p className="text-muted-foreground mt-1">
            Box plots showing efficiency distribution for each machine-operator pair ({reportData?.data?.length || 0} groups)
          </p>
        </div>
        <Button
          onClick={() => setReportGenerated(false)}
          variant="outline"
          data-testid="button-new-report"
        >
          New Report
        </Button>
      </div>

      {boxPlotChartData.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">No production data available to generate report</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Efficiency Distribution</CardTitle>
              <CardDescription>
                Box plot showing efficiency percentages for each machine-operator pair
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={boxPlotChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={200} />
                  <Tooltip
                    formatter={(value) => {
                      if (typeof value === "number") {
                        return value.toFixed(1) + "%";
                      }
                      return value;
                    }}
                  />
                  <Legend />
                  <Bar dataKey="min" fill="#8b5cf6" name="Min" />
                  <Bar dataKey="q1" fill="#6366f1" name="Q1" />
                  <Bar dataKey="median" fill="#3b82f6" name="Median" />
                  <Bar dataKey="q3" fill="#06b6d4" name="Q3" />
                  <Bar dataKey="max" fill="#10b981" name="Max" />
                  <Bar dataKey="mean" fill="#f59e0b" name="Mean" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary Statistics</CardTitle>
              <CardDescription>
                Efficiency metrics for each machine-operator pair
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Machine</th>
                      <th className="text-left py-2 px-2">Operator</th>
                      <th className="text-right py-2 px-2">Min</th>
                      <th className="text-right py-2 px-2">Q1</th>
                      <th className="text-right py-2 px-2">Median</th>
                      <th className="text-right py-2 px-2">Q3</th>
                      <th className="text-right py-2 px-2">Max</th>
                      <th className="text-right py-2 px-2">Mean</th>
                      <th className="text-right py-2 px-2">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData?.data?.map((item) => (
                      <tr key={`${item.machineId}-${item.operatorId}`} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">{item.machineName}</td>
                        <td className="py-2 px-2">{item.operatorName || "Unknown"}</td>
                        <td className="text-right py-2 px-2">{item.min.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2">{item.q1.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2 font-semibold">{item.median.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2">{item.q3.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2">{item.max.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2">{item.mean.toFixed(1)}%</td>
                        <td className="text-right py-2 px-2">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
