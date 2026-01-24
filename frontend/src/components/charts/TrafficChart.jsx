import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload) return null;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-xs">
          <span 
            className="w-2 h-2 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground capitalize">{entry.name}:</span>
          <span className="font-mono font-medium">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export const TrafficChart = ({ data, height = 300 }) => {
  const [activeAreas, setActiveAreas] = useState({
    inbound: true,
    outbound: true,
    blocked: true,
    anomalous: true,
  });

  const toggleArea = (key) => {
    setActiveAreas(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const areaConfig = [
    { key: 'inbound', color: 'hsl(var(--primary))', label: 'Inbound' },
    { key: 'outbound', color: 'hsl(var(--chart-4))', label: 'Outbound' },
    { key: 'blocked', color: 'hsl(var(--warning))', label: 'Blocked' },
    { key: 'anomalous', color: 'hsl(var(--destructive))', label: 'Anomalous' },
  ];

  return (
    <div className="w-full">
      {/* Custom legend */}
      <div className="flex items-center gap-4 mb-4">
        {areaConfig.map(({ key, color, label }) => (
          <button
            key={key}
            onClick={() => toggleArea(key)}
            className={cn(
              "flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-all",
              activeAreas[key] 
                ? "opacity-100" 
                : "opacity-40 hover:opacity-60"
            )}
          >
            <span 
              className="w-3 h-3 rounded-sm" 
              style={{ backgroundColor: color }}
            />
            {label}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {areaConfig.map(({ key, color }) => (
              <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            vertical={false} 
          />
          <XAxis 
            dataKey="time" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            dx={-10}
            tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(0)}k` : value}
          />
          <Tooltip content={<CustomTooltip />} />
          {areaConfig.map(({ key, color }) => (
            activeAreas[key] && (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#gradient-${key})`}
                animationDuration={1500}
                animationBegin={0}
              />
            )
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrafficChart;
