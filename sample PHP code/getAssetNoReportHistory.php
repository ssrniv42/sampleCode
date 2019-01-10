<?php
//Track24 2014
//Author : Steven Crawford
//Co-Author : Jing Guan
//Get Asset No Report Alert History

session_start(); include $_SESSION['SYSCON_URL'];
	
	// get the current client id
	$owner = $_SESSION['SESS_CLIENT_ID'];

	// get specific period
	$history_time = $_GET['history_time'];

	if($history_time == -1){
		$last_timestamp = 0;
	}else{
		$last_timestamp = (time() - $history_time) * 1000; // convert to millisecond
	}
	
	$user_perm_str= '';
	$group_str='';
	
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'user'){
		$userId = $_SESSION['USR_USER_ID'];
		$user_perm_str= " INNER JOIN groups_assets 
							ON groups_assets.asset_id = assets.ats_id
						INNER JOIN user_group_perms 
							ON groups_assets.group_id = user_group_perms.group_id AND user_group_perms.client_id = '". 
							$owner ."' AND user_group_perms.user_id= ".$userId;
		$group_str= " GROUP BY NonReportAlertHistory.client_id, NonReportAlertHistory.asset_id, NonReportAlertHistory.start_time";
	}
	
	$queryDataGet = "SELECT * FROM assets 
						INNER JOIN NonReportAlertHistory 
							ON assets.ats_id = NonReportAlertHistory.asset_id AND cl_id = '".$owner."' AND NonReportAlertHistory.start_time >= ".$last_timestamp.$user_perm_str.$group_str.
							" ORDER BY NonReportAlertHistory.start_time";
	
	$resultDataGet = mysql_query($queryDataGet);

	$result = array();
	$status = array();
	
	if($resultDataGet != false){
		while($row = mysql_fetch_assoc($resultDataGet))
			$result[] = $row;
	}
	else{
		array_push($status , array('error'=>'Failed to load asset no reporting history!'));
		array_push($status , array('debug'=>'Failed to load asset no reporting history! SQL error : '.mysql_error()));
	}

	echo json_encode(array("result" => $result, "status" => $status));
	unset($_GET['history_time']);
	exit();
?>
