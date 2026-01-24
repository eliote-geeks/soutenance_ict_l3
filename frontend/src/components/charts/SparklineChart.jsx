import { Line, LineChart, ResponsiveContainer } from 'recharts';

export const SparklineChart = ({ 
  data, 
  color = 'hsl(var(--primary))', 
  height = 40,
  width = 100 
}) => {
  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SparklineChart;
