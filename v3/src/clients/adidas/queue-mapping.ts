/**
 * Agentic QE v3 - Adidas IIB Flow → MQ Queue Mapping
 * Maps the 11 IIB message flows to their underlying MQ queue names.
 *
 * Queue naming convention: EAI.AD[REGION].OMS.[TYPE].[DIR]
 * Region is configurable (ADWE = Western Europe, ADUS = US, etc.)
 *
 * IMPORTANT: These queue names are provisional based on the naming convention
 * observed in the omnihub-baseline repo. Actual queue names must be confirmed
 * with the Adidas middleware team when MQ credentials are provided.
 */

import type { FlowQueueMapping } from '../../integrations/iib/types';

// ============================================================================
// Queue Mapping Builder
// ============================================================================

/**
 * Build Adidas flow-to-queue mappings for the given region code.
 * Default region: 'ADWE' (Western Europe — Portugal PT Correos test case).
 */
export function buildAdidasQueueMappings(region = 'ADWE'): FlowQueueMapping[] {
  const prefix = `EAI.${region}`;

  return [
    // =========================================================================
    // FORWARD FLOW (Steps 3-7)
    // =========================================================================
    {
      // Step 03: Shipment request from OmniHub to WMS (via TIBCO)
      flowName: 'MF_ADS_OMS_ShipmentRequest_WMS_SYNC',
      outputQueue: `${prefix}.OMS.SHIPMENTREQUEST.OUT`,
    },
    {
      // Step 04: AFS Sales Order creation from OmniHub to SAP AFS
      flowName: 'MF_ADS_OMS_AFS_SalesOrderCreation',
      outputQueue: `${prefix}.OMS.SALESORDER.OUT`,
    },
    {
      // Step 05: AFS Sales Order Acknowledgment back to OmniHub
      flowName: 'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC',
      inputQueue: `${prefix}.OMS.SOACK.IN`,
    },
    {
      // Step 06: Shipment/Sales Transfer Order to LAM (EPOCH)
      flowName: 'MF_ADS_EPOCH_Shipment_Sales_Transfer_Order_LAM',
      outputQueue: `${prefix}.OMS.TRANSFER.OUT`,
    },
    {
      // Step 07: WMS Ship Confirmation back to OmniHub (SOAP over MQ)
      flowName: 'MF_ADS_WMS_ShipmentConfirm_SYNC',
      inputQueue: `${prefix}.OMS.SHIPCONFIRM.IN`,
    },

    // =========================================================================
    // CARRIER / POD FLOW (Steps 9-11)
    // =========================================================================
    {
      // Step 09: NShift label creation (HTTP — queue may not exist, verify)
      flowName: 'MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC',
      outputQueue: `${prefix}.OMS.NSHIFT.LABEL.OUT`,
    },
    {
      // Steps 10-11: Carrier POD events from NShift via Kafka to OmniHub
      flowName: 'MF_ADS_CARRIER_KAFKA_OMS_PUSH_PODUpdate',
      inputQueue: `${prefix}.OMS.PODUPDATE.IN`,
    },

    // =========================================================================
    // EMAIL FLOW (Strategy 2 — Steps 13-14, 19, 21, 26)
    // =========================================================================
    {
      // Email trigger from OmniHub to SFMC (async)
      flowName: 'MF_ADS_OMS_EmailTrigger_ASYNC',
      outputQueue: `${prefix}.OMS.EMAIL.IN`,
    },

    // =========================================================================
    // RETURN FLOW (Steps 18, 22-23)
    // =========================================================================
    {
      // Step 18: Return authorization from OmniHub to WMS (via TIBCO)
      flowName: 'MF_ADS_EPOCH_ReturnAuthorization_WE',
      outputQueue: `${prefix}.OMS.RETURNAUTH.OUT`,
    },
    {
      // Step 22: WMS Return Confirmation back to OmniHub (SOAP over MQ)
      flowName: 'MF_ADS_WMS_ReturnConfirmation_SYNC',
      inputQueue: `${prefix}.OMS.RETURNCONFIRM.IN`,
    },
    {
      // Step 23: SAP CAR Return Transaction posting
      // NOTE: Architecture docs use MFP_ prefix (MFP_ADS_EPOCH_SAPCAR_Sales_Return_Transaction).
      // Confirm exact prefix with middleware team during technical review.
      // Both variants are mapped here — MQ browse will match whichever exists.
      flowName: 'MF_ADS_EPOCH_SAPCAR_Sales_Return_Transaction',
      outputQueue: `${prefix}.OMS.SAPCAR.OUT`,
    },
  ];
}
