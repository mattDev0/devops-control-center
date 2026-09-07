package com.devops.controlcenter.orchestrator.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Egress position for the personal VPN, expressed in the terms the credit is
 * billed in. Any field may be null when the exporter does not publish the
 * underlying series, so the dashboard renders what exists rather than guessing.
 */
@JsonInclude(JsonInclude.Include.ALWAYS)
public class VpnUsageDto {

    private boolean reachable;
    private Double usedBytes;
    private Double budgetBytes;
    private Double costUsd;
    private Double creditUsd;
    private Double burnBytesPerDay;
    private Long cycleStart;
    private Long cycleEnd;
    private Integer tunnelsUp;
    private Integer tunnelsTotal;
    private Boolean autostopArmed;
    /** True when usage is measured over calendar months rather than the credit cycle. */
    private boolean calendarMonthFallback;
    /** False when the cycle has days with no recorded data, so the total under-reports. */
    private Boolean dataComplete;
    /** True when cost is derived from a rate card rather than real billing figures. */
    private Boolean costEstimated;

    public boolean isReachable() { return reachable; }
    public void setReachable(boolean v) { this.reachable = v; }

    public Double getUsedBytes() { return usedBytes; }
    public void setUsedBytes(Double v) { this.usedBytes = v; }

    public Double getBudgetBytes() { return budgetBytes; }
    public void setBudgetBytes(Double v) { this.budgetBytes = v; }

    public Double getCostUsd() { return costUsd; }
    public void setCostUsd(Double v) { this.costUsd = v; }

    public Double getCreditUsd() { return creditUsd; }
    public void setCreditUsd(Double v) { this.creditUsd = v; }

    public Double getBurnBytesPerDay() { return burnBytesPerDay; }
    public void setBurnBytesPerDay(Double v) { this.burnBytesPerDay = v; }

    public Long getCycleStart() { return cycleStart; }
    public void setCycleStart(Long v) { this.cycleStart = v; }

    public Long getCycleEnd() { return cycleEnd; }
    public void setCycleEnd(Long v) { this.cycleEnd = v; }

    public Integer getTunnelsUp() { return tunnelsUp; }
    public void setTunnelsUp(Integer v) { this.tunnelsUp = v; }

    public Integer getTunnelsTotal() { return tunnelsTotal; }
    public void setTunnelsTotal(Integer v) { this.tunnelsTotal = v; }

    public Boolean getAutostopArmed() { return autostopArmed; }
    public void setAutostopArmed(Boolean v) { this.autostopArmed = v; }

    public boolean isCalendarMonthFallback() { return calendarMonthFallback; }
    public void setCalendarMonthFallback(boolean v) { this.calendarMonthFallback = v; }

    public Boolean getDataComplete() { return dataComplete; }
    public void setDataComplete(Boolean v) { this.dataComplete = v; }

    public Boolean getCostEstimated() { return costEstimated; }
    public void setCostEstimated(Boolean v) { this.costEstimated = v; }
}
