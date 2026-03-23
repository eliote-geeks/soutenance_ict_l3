import { useState, useEffect, useRef } from 'react';
import { Network, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSkeleton } from '@/components/shared/LoadingSkeleton';
import * as d3 from 'd3';
import { cn } from '@/lib/utils';

// Generate mock network data
const generateNetworkData = () => {
  const nodes = [
    { id: 'internet', group: 'external', label: 'Internet', type: 'cloud' },
    { id: 'fw-01', group: 'perimeter', label: 'Firewall', type: 'security' },
    { id: 'dmz-web', group: 'dmz', label: 'DMZ Web', type: 'server' },
    { id: 'dmz-mail', group: 'dmz', label: 'DMZ Mail', type: 'server' },
    { id: 'core-sw', group: 'internal', label: 'Core Switch', type: 'network' },
    { id: 'srv-prod-01', group: 'internal', label: 'Prod Server 1', type: 'server' },
    { id: 'srv-prod-02', group: 'internal', label: 'Prod Server 2', type: 'server' },
    { id: 'db-master', group: 'internal', label: 'DB Master', type: 'database' },
    { id: 'db-replica', group: 'internal', label: 'DB Replica', type: 'database' },
    { id: 'workstation-1', group: 'endpoint', label: 'WS-001', type: 'endpoint' },
    { id: 'workstation-2', group: 'endpoint', label: 'WS-002', type: 'endpoint' },
    { id: 'attacker', group: 'threat', label: '45.33.32.156', type: 'threat' },
  ];

  const links = [
    { source: 'internet', target: 'fw-01', value: 100, type: 'normal' },
    { source: 'attacker', target: 'fw-01', value: 50, type: 'malicious' },
    { source: 'fw-01', target: 'dmz-web', value: 80, type: 'normal' },
    { source: 'fw-01', target: 'dmz-mail', value: 30, type: 'normal' },
    { source: 'fw-01', target: 'core-sw', value: 60, type: 'normal' },
    { source: 'core-sw', target: 'srv-prod-01', value: 40, type: 'normal' },
    { source: 'core-sw', target: 'srv-prod-02', value: 35, type: 'normal' },
    { source: 'core-sw', target: 'db-master', value: 25, type: 'normal' },
    { source: 'db-master', target: 'db-replica', value: 20, type: 'normal' },
    { source: 'core-sw', target: 'workstation-1', value: 15, type: 'normal' },
    { source: 'core-sw', target: 'workstation-2', value: 15, type: 'normal' },
    { source: 'attacker', target: 'srv-prod-01', value: 10, type: 'malicious' },
  ];

  return { nodes, links };
};

export default function NetworkMapPage() {
  const svgRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    // Simulate loading
    setTimeout(() => {
      setData(generateNetworkData());
      setLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = 500;

    const g = svg.append('g');

    // Color scale for groups
    const groupColors = {
      external: 'hsl(var(--muted-foreground))',
      perimeter: 'hsl(var(--primary))',
      dmz: 'hsl(var(--warning))',
      internal: 'hsl(var(--chart-4))',
      endpoint: 'hsl(var(--chart-5))',
      threat: 'hsl(var(--destructive))',
    };

    // Create simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // Draw links
    const link = g.append('g')
      .selectAll('line')
      .data(data.links)
      .enter()
      .append('line')
      .attr('stroke', d => d.type === 'malicious' ? 'hsl(var(--destructive))' : 'hsl(var(--border))')
      .attr('stroke-width', d => Math.sqrt(d.value / 10))
      .attr('stroke-dasharray', d => d.type === 'malicious' ? '5,5' : 'none')
      .attr('opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(data.nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Node circles
    node.append('circle')
      .attr('r', d => d.group === 'threat' ? 15 : 12)
      .attr('fill', d => groupColors[d.group])
      .attr('stroke', 'hsl(var(--background))')
      .attr('stroke-width', 2);

    // Node labels
    node.append('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('dy', 25)
      .attr('font-size', '10px')
      .attr('fill', 'hsl(var(--foreground))')
      .attr('font-family', 'Manrope');

    // Zoom behavior
    const zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton variant="chart" className="h-[600px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Network Flows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualize suspicious flows and lateral movement candidates
          </p>
        </div>
      </div>

      {/* Network Visualization */}
      <Card className="border-border/50 shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            Network Topology and Suspicious Flows
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Zoom: {(zoom * 100).toFixed(0)}%
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative bg-muted/20 rounded-xl overflow-hidden border border-border/50">
            <svg 
              ref={svgRef} 
              width="100%" 
              height="500"
              className="cursor-grab active:cursor-grabbing"
            />
          </div>
          
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--muted-foreground))' }} />
              <span className="text-xs text-muted-foreground">External</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
              <span className="text-xs text-muted-foreground">Perimeter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--warning))' }} />
              <span className="text-xs text-muted-foreground">DMZ</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-4))' }} />
              <span className="text-xs text-muted-foreground">Internal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive))' }} />
              <span className="text-xs text-muted-foreground">Threat</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <span className="w-6 h-0.5 bg-border" />
              <span className="text-xs text-muted-foreground">Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-0.5 border-t-2 border-dashed border-destructive" />
              <span className="text-xs text-muted-foreground">Malicious</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Traffic Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Traffic Sources</h3>
            <div className="space-y-2">
              {['Internet (78%)', 'Core Switch (15%)', 'Workstations (7%)'].map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{item.split(' ')[0]}</span>
                  <Badge variant="outline">{item.match(/\(.*\)/)[0]}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Suspicious Connections</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-destructive">45.33.32.156</span>
                <Badge className="severity-critical">Active</Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Targeting: srv-prod-01, fw-01
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-soft">
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Network Health</h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
                <span className="text-lg font-bold text-success">98%</span>
              </div>
              <div>
                <p className="text-sm font-medium">All Systems Operational</p>
                <p className="text-xs text-muted-foreground">12 nodes monitored</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
