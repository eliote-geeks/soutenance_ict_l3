import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-foreground mb-2">Hour {label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">Predicted:</span>
          <span className="font-mono font-medium">{data.predicted}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-muted" />
          <span className="text-muted-foreground">Range:</span>
          <span className="font-mono font-medium">{data.lower} - {data.upper}</span>
        </div>
      </div>
    </div>
  );
};

export const PredictionChart = ({ data, height = 300 }) => {
  const currentHour = new Date().getHours();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradient-confidence" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradient-predicted" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="hsl(var(--border))" 
          vertical={false} 
        />
        <XAxis 
          dataKey="hour" 
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          tickFormatter={(hour) => `${hour}:00`}
        />
        <YAxis 
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        
        {/* Confidence band */}
        <Area
          type="monotone"
          dataKey="upper"
          stroke="none"
          fill="url(#gradient-confidence)"
          animationDuration={1500}
        />
        <Area
          type="monotone"
          dataKey="lower"
          stroke="none"
          fill="hsl(var(--background))"
          animationDuration={1500}
        />
        
        {/* Predicted line */}
        <Area
          type="monotone"
          dataKey="predicted"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#gradient-predicted)"
          animationDuration={1500}
        />
        
        {/* Current hour marker */}
        <ReferenceLine 
          x={currentHour} 
          stroke="hsl(var(--muted-foreground))" 
          strokeDasharray="4 4" 
          label={{ 
            value: 'Now', 
            position: 'top',
            fill: 'hsl(var(--muted-foreground))',
            fontSize: 11
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default PredictionChart;
