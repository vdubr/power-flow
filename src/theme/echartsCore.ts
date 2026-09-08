/**
 * Tree-shaken ECharts build.
 *
 * Importing the `echarts` barrel pulls in every chart type and component,
 * which cost 1.1 MB of the bundle for an app that draws lines and bars.
 * Registering only what the charts actually use keeps the download small;
 * anything not registered here silently fails to render, so add to this list
 * when a chart starts using a new feature.
 */
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  ToolboxComponent,
  BrushComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  ToolboxComponent,
  BrushComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  TitleComponent,
  CanvasRenderer,
]);

export default echarts;
export { echarts };
