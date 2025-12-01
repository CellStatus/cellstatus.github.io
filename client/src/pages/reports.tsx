import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown } from "lucide-react";

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
  data: any[];
  machineLogs: MachineLog[];
  jobSetterActivities: JobSetterActivity[];
}

export default function Reports() {
  const [reportGenerated, setReportGenerated] = useState(false);
  const [reportTimestamp, setReportTimestamp] = useState<Date | null>(null);

  const { data: reportData, isLoading } = useQuery<ReportResponse>({
    queryKey: ["/api/reports/efficiency"],
    enabled: reportGenerated,
    staleTime: 0,
  });

  const handleGenerateReport = () => {
    setReportTimestamp(new Date());
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


  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Production Efficiency Report</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Generated on {reportTimestamp?.toLocaleDateString()} at {reportTimestamp?.toLocaleTimeString()}
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
        <div className="p-4 space-y-4">
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
                <CardTitle className="text-lg">Activities</CardTitle>
                <CardDescription className="text-xs">
                  Recent operator activities and updates
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
      </div>
    </div>
  );
}
