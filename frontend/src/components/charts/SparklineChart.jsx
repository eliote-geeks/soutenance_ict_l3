import { Line, LineChart } from 'recharts';

export const SparklineChart = ({ 
  data, 
  color = 'hsl(var(--primary))', 
  height = 40,
  width = 200 
}) => {
  const chartData = Array.isArray(data) ? data.map((value, index) => ({ value, index })) : [];

  return (
    <div style={{ width, height, minWidth: width }}>
      <LineChart width={width} height={height} data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          animationDuration={1000}
          isAnimationActive
        />
      </LineChart>
    </div>
  );
};

export default SparklineChart;
