<?php
//Track24 2014
//Author : Steven Crawford
//Co-Author : Jing Guan
//Get Asset No Report Alert

session_start(); include $_SESSION['SYSCON_URL'];
	
	// get the current client id
	$owner = $_SESSION['SESS_CLIENT_ID'];

	$user_perm_str= '';
	$group_str='';
	
	if($_SESSION['SESS_ACCOUNT_TYPE'] == 'user'){
		$userId = $_SESSION['USR_USER_ID'];
		$user_perm_str= " INNER JOIN groups_assets 
							ON groups_assets.asset_id = assets.ats_id
						INNER JOIN user_group_perms 
							ON groups_assets.group_id = user_group_perms.group_id AND user_group_perms.client_id = '". 
							$owner ."' AND user_group_perms.user_id= ".$userId;
		$group_str= " GROUP BY NonReportAlertRecent.client_id, NonReportAlertRecent.asset_id";
	}					

	$queryDataGet = "SELECT assets.*, NonReportAlertRecent.* FROM assets 
						INNER JOIN NonReportAlertRecent 
							ON assets.ats_id = NonReportAlertRecent.asset_id AND NonReportAlertRecent.client_id = '".$owner."' AND assets.cl_id = '".$owner."'".$user_perm_str.$group_str." ORDER BY NonReportAlertRecent.start_time";
	$resultDataGet = mysql_query($queryDataGet);

	$result = array();
	$status = array();
	
	if($resultDataGet != false){
		while($row = mysql_fetch_assoc($resultDataGet))
			$result[] = $row;
	}
	else{
		array_push($status , array('error'=>'Failed to load asset no reporting!'));
		array_push($status , array('debug'=>'Failed to load asset no reporting! SQL error : '.mysql_error()));
	}

	echo json_encode(array("result" => $result, "status" => $status));
	exit();
?>
