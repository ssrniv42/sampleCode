<?php
//Track24 2013
//Author : Steven Crawford
//Co-Author : Masoud Omran
//G.U.I v2.5
//archives a pending panic for specific asset
session_start(); include $_SESSION['SYSCON_URL'];

    // Code added by G. Corke April 1,2014
	// Should not allow execution is any $_SESSION variables are not set
	// if(!isset($_SESSION['SESS_ACCOUNT_TYPE'])||!isset($_SESSION['SESS_CLIENT_ID')) exit();
    if(!isset($_SESSION['SESS_ACCOUNT_TYPE'])) exit(); 
    // End of addition	
	
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'client'){
		$owner = $_SESSION['SESS_CLIENT_ID'];
		$name = $_SESSION['SESS_LOGIN_NAME'];
	}//end IF
	
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'user'){
		$owner = 'u'.$_SESSION['SESS_CLIENT_ID'];
		$name = $_SESSION['USR_LOGIN_NAME'];
	}//end IF
	
	$assetId = $_GET['assetId'];

	$assetResetPanic = array();
	$success= FALSE;
	$message='';
	
	$qryResetPanic = sprintf("UPDATE PanicReset SET is_reset= 1 WHERE asset_id= '%s' AND is_reset = 0", $assetId);
	$resultResetPanic = mysql_query($qryResetPanic);
		
	if($resultResetPanic){		
			$success= TRUE;			
			$message= 'Panic archived';
	}// end if
	else{
		$message= 'Failed: '. mysql_error();
	}
	
	array_push($assetResetPanic, array('success' => $success, 'message' => $message));
	echo json_encode($assetResetPanic);
	unset($_GET['assetId']);
	exit();	
?>