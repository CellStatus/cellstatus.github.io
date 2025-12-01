import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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

interface MachineLog {
  machineId: string;
  machineName: string;
  status: string;
  operatorName: string;
  statsCount: number;
  totalUnitsProduced: number;
  avgEfficiency: string;
  createdAt: string;
  createdBy: string;
  lastUpdated: string;
  lastUpdatedBy: string;
}

interface JobSetterActivity {
  operatorName: string;
  operatorId: string;
  type: string;
  target: string;
  timestamp: string;
  details: string;
}

interface ReportResponse {
  data: BoxPlotData[];
  machineLogs: MachineLog[];
  jobSetterActivities: JobSetterActivity[];
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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold mb-1">Production Efficiency Report</h1>
          <p className="text-muted-foreground text-sm">Generating efficiency analysis...</p>
        </div>
        <div className="flex-1 px-4 pb-4">
          <Skeleton className="h-full" />
        </div>
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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Production Efficiency Report</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Efficiency distribution for {reportData?.data?.length || 0} machine-operator groups
            </p>
          </div>
          <Button
            onClick={() => setReportGenerated(false)}
            variant="outline"
            size="sm"
            data-testid="button-new-report"
          >
            New Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {boxPlotChartData.length === 0 ? (
          <div className="p-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No production data available to generate report</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Efficiency Distribution</CardTitle>
                <CardDescription className="text-xs">
                  Box plot showing efficiency percentages for each machine-operator pair
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={boxPlotChartData} layout="vertical" margin={{ left: 150, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={145} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => {
                        if (typeof value === "number") {
                          return value.toFixed(1) + "%";
                        }
                        return value;
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "16px" }} />
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

            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Machine Logs</CardTitle>
                <CardDescription className="text-xs">
                  Summary of each machine and its production statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="border-b sticky top-0 bg-background">
                      <tr>
                        <th className="text-left py-1 px-1">Machine</th>
                        <th className="text-left py-1 px-1">Status</th>
                        <th className="text-left py-1 px-1">Operator</th>
                        <th className="text-right py-1 px-1">Units</th>
                        <th className="text-right py-1 px-1">Eff%</th>
                        <th className="text-left py-1 px-1">Created By</th>
                        <th className="text-left py-1 px-1">Last Updated By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.machineLogs?.map((log) => (
                        <tr key={log.machineId} className="border-b hover:bg-muted/50">
                          <td className="py-1 px-1 truncate font-medium">{log.machineName}</td>
                          <td className="py-1 px-1 capitalize text-xs">{log.status}</td>
                          <td className="py-1 px-1 truncate">{log.operatorName}</td>
                          <td className="text-right py-1 px-1 tabular-nums">{log.totalUnitsProduced}</td>
                          <td className="text-right py-1 px-1 tabular-nums">{log.avgEfficiency}%</td>
                          <td className="py-1 px-1 truncate text-xs">{log.createdBy}</td>
                          <td className="py-1 px-1 truncate text-xs">{log.lastUpdatedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Job Setter Activities</CardTitle>
                <CardDescription className="text-xs">
                  Recent operator/job setter activities and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {reportData?.jobSetterActivities && reportData.jobSetterActivities.length > 0 ? (
                    reportData.jobSetterActivities.slice(0, 30).map((activity, idx) => (
                      <div key={idx} className="text-xs pb-2 border-b last:border-b-0">
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <div className="font-medium">{activity.operatorName}</div>
                            <div className="text-muted-foreground">{activity.type} - {activity.target}</div>
                            <div className="text-xs">{activity.details}</div>
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-xs">No activities recorded</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
