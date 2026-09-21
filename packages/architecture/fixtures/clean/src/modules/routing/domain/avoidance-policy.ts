export interface ReportedObstruction {
  id: string;
  limitM?: number;
}

export function applies(obstruction: ReportedObstruction, vehicleHeightM: number): boolean {
  return obstruction.limitM === undefined || vehicleHeightM > obstruction.limitM;
}
