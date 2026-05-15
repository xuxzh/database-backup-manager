import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "./EmptyState";

export type DataTableRow = {
  key: string | number;
  cells: ReactNode[];
  rowState?: "selected";
  onClick?: () => void;
};

export function DataTable({
  title,
  description,
  action,
  emptyText,
  headers,
  rows,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  emptyText: string;
  headers: string[];
  rows: DataTableRow[];
}) {
  return (
    <Card>
      {(title || description || action) && (
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </CardHeader>
      )}
      <CardContent className="p-0 overflow-x-auto">
        {rows.length ? (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} data-state={row.rowState} onClick={row.onClick}>
                  {row.cells.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[320px]">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState text={emptyText} />
        )}
      </CardContent>
    </Card>
  );
}